# Green-Roomz race second pass

Date: 2026-09-03. First board: `/workspace/reviews/race-review.md`.
Trees: `/workspace/green-roomz` (citations) and live pack `/workspace/e2e-fresh/green-roomz` (serve). Race files `diff -q` equal for scheduler, mailbox, process-manager, gateway, proxy, monitor/ipc, monitor/logger.

Did not patch the tree. Did not reboot. Did not send inference that could pin slot 0.

Sibling boards read: `boundary-review.md`, `covert-channel-review.md` (= `covert-review.md`), `covert-fixes.md`, `fuzz-review.md`.

---

## Live 127.0.0.1:8080 (read-only)

Observed 2026-09-03 ~11:37Z (PT 04:37). Same PIDs fuzz used.

| | |
|---|---|
| gateway | node `1849424` `bin/green-roomz.mjs serve --manifest config/agents.cursor.json --host 127.0.0.1 --port 8080` |
| llama | `1849480` `:8187` `--parallel 1 --threads 4 --threads-batch 4 --poll 0 --alias tool-router-agent` profile `cpu-4` |
| LWPs | llama 15 (GGML 4 + extras); host `nproc=8` |
| health | 200 `degraded`, `policy: responsive`, `uptime_ms` ~1.35e6 |
| metrics | `in_flight: 0`, `queued: 0`, `sessions: 31` / limit 64 |
| specialists | all `cold` or `unavailable`; only resident ready |
| llama `/health` | `{"status":"ok"}` |
| `/slots` | one slot, `id:0`, `is_processing: false`, leftover `n_prompt_tokens: 122`, `max_tokens: 1` (fuzz resident turn) |

`GET /v1/monitor/recent` (three hops, both rings):

- mailbox `seq` is a JS number `1..3`; IPC `seq` is `{hi:0, lo:1..3}`
- occupancy both `size:0`, `pushed:3`, `dropped:0` after auto-drain
- kinds all `success` (`general-text-speculator` / `security-monitor-agent` / `tool-router-agent`)
- general-text is **cold now** (idle evict after that hop). Envelope still says `success`. That is history, not proof of G2 by itself.

HEAD `/health` via `curl -I` was 1ms. Fuzz `h012` HEAD and `r001`/`r002` malformed TE/CL were ~6000ms. Different clients: curl `-I` does not wait for the advertised body.

This box has 8 logical CPUs, so resident `--threads 4` is **not** oversubscribed here. The 8-on-4 stall (RACE-L3) is the Cursor laptop config, not this serve. Live does confirm Cursor nexus is `cpu-4` (4 threads), not the `--threads 2` covert-fixes F5 examples assume.

---

## First-board verdicts after re-read + live

Keep as written, with these adjustments:

| ID | Pass-2 |
|---|---|
| **RACE-S1** | Still #1 to fix. Not tripped live (`in_flight:0` after fuzz). Fuzz did not abort during `acquire`. Severity stays critical because `responsive` max=1 + `requestTimeout` 0. |
| **RACE-G1** | **Live-confirmed seq split.** Happy-path counts matched (both rings pushed 3). Split-brain is still the reject/drop path, not the quiet path. Boundary **B12** is the same dual-write with mailbox ungated. |
| **RACE-G2** | Unchanged. Did not re-fire a 180s generation. Fuzz resident `max_tokens=1` finished in 74ms so it would not show the premature-success vs 504 split. |
| **RACE-G3** | Unchanged. No peek-timeout on this quiet box. |
| **RACE-P1/P2/P3** | Unchanged. Single child on 8187; no profile fallback observed. |
| **RACE-P4/P5/P6** | Unchanged. Live shows the *after* of P5: general-text success then cold. Sweep of idle is intended; the bug is sweep/evict **during** in-flight (not visible now). |
| **RACE-L2** | Slot 0 idle with leftover prompt tokens. Covert **CC-8/CC-13** and covert-fixes **F3/F13** are the leak side of the same slot. |
| **RACE-L3 / P10** | Config still `cpu-4` then `cpu-6` for nexus **and** code specialist. Live host 8-way so not hung. Covert-fixes F5 `allocateSets` is the right pin **if** resident is 2; shipped Cursor resident is 4. |
| **LIVE-LOG1 / ENT1 / NTP1** | Unchanged. Fuzz did not exercise logger path / entropy. |
| **RACE-M1** | Latent. Live `listeners: 0`. |
| **Stubs / 8080 reboot** | Agrees with fuzz (HTTP 404) and boundary (throw vs reject in-process). No callable race. Throw-not-reject is boundary B4, not a hang. |

---

## New / raised from sibling boards + live (races/liveness only)

### LIVE-H1 — HEAD and malformed framing stall ~6s
- **from:** fuzz `h012` HEAD `/health` 6013ms; `r001` TE-chunked-no-chunks 6008ms; `r002` CL-mismatch GET 6004ms. Not >30s.
- **file:** `src/gateway.mjs:1175-1176` (`headersTimeout` 30s, `requestTimeout` 0); Node HTTP parser + `Keep-Alive: timeout=5`
- **race:** client vs parser waiting for a body that HEAD / bad TE will never send. Event loop is not blocked (other GETs in fuzz stayed ~12ms).
- **impact:** that connection pins a socket ~5–6s. With `requestTimeout` 0, a flood of HEAD/bad-TE can fill the listen backlog. Not a PolicyGate leak by itself.
- **fix:** default finite `request_timeout_ms` (also LIVE-G1). For HEAD, skip body / omit `Content-Length`, or answer HEAD with `content-length: 0`.

### LIVE-H2 — GET-family routes ignore method
- **from:** fuzz `h007–h010` POST/PUT/DELETE/PATCH `/health` `/v1/models` still 200.
- **liveness:** extra work on “read” URLs (health walks every agent). Not a hang. Boundary can own CSRF; here just: health should be GET-only so a stuck POST body cannot pin the parser (composes with H1).

### Note — mailbox `ok:true` on lockdown kinds
- **from:** fuzz `m002–m004`; boundary **B12**.
- Drain does not dispatch verbs (SAFE for execution). Dual-post G1 still copies that envelope onto HTTP recent. Fix with RF6/RF7 (IPC as source of truth + mailbox kind allowlist). Not a new reboot path.

### Note — `/evil/route` mints sessions (B20)
- Residual liveness: session ledger 31/64 after fuzz. `SessionLedger` evicts oldest (`sessions.mjs:12-13, 54-60`), so it does not hang. Skip as a race finding.

---

## Overlaps (do not duplicate; compose)

| Other ID | Race ID | How they meet |
|---|---|---|
| B12 ungated mailbox | G1, M2 | Same dual-write. Fix: IPC-only publish or mailbox uses IPC reject rules. |
| B4 throw vs reject | stubs SAFE | 8080 still cannot call. Callers that `catch {}` (observeHop) hide IPC rejects — that **is** G1. |
| B25 entropy ignores respond verbs | ENT1 | Missing cap / unknown source already fail-open. |
| CC-8 slot 0 KV | L2, G3 | Next client sees residue; abort/retry also races the same slot. |
| CC-9 `cache_prompt` forwarded | L2 | Client can pin cache on the only slot. Covert F3/F8 strip it. |
| CC-11 no affinity | L3 | Covert F5 pins. Race pack caps **sum** of `--threads` first so F5 has cores left. |
| CC-13 disk KV / idle slots | L2 | Covert F3 drops `--cache-idle-slots` and default checkpoint. Do that **before** hopping a live slot. |
| CC-20 reject cache forever | I3 | Same map. Covert F19 TTL. |
| CC-26 drain broadcast | M1, M4 | Listeners 0 live. Snapshot-before-callback still required if anyone registers. |
| Fuzz 500 `messages=number` | — | Type error, not a race. Leave to boundary/fuzz. |

---

## Integration hazards with `covert-fixes.md` (do not fork; constrain)

Researcher integrates all five packs. Race pack will **use** F3/F5/F8/F13/F19/F22, not invent a second CPU/slot story. Constraints:

1. **F1 `await sleep(holdMs)` inside `proxyJson` / SSE flush** holds `PolicyGate` for an extra quantum while `responsive` max=1. That is a liveness pin. Quantize **timestamps and frame sizes** off the slot; do not sleep on the acquired hop. If a hold is required, it must run *after* `release()` or on a timer that does not keep `active++`.
2. **F5 `allocateSets`:** operator lock is 4-thread default / 6-thread sprint. This Cursor host is 8-way — **keep nexus at 4**, do not drop to 2 (Researcher 2026-09-03). Refuse oversubscribe: empty CPU set → do not spawn; do not wrap; do not retry `cpu-6` when remaining < 6. On a 4-CPU box specialist 4 is refused while nexus holds 4. F5 Windows examples with nexus 2 stay valid for that manifest only.
3. **F13 “restore prime-only after each live hop”** is a `/slots/0` action. It must take the same in-flight refcount as RF2. Never restore while `is_processing` or refs > 0 (L2/G3).
4. **F2 hash-always + `publicStats`** does not fix G1 (two rings, two seq types) or M1 (reentrant drain). Orthogonal; apply after RF6/RF7 so hashed payloads still come from one publish.
5. **F22 logger cap** must return `{ok:false, dropped:true}` (LIVE-LOG1), not `ok: true`. Covert hash of the chain is fine.

---

## Still SAFE

- coldStartChain FIFO, no A-B-A deadlock
- same-alias `starting` coalesce
- 8080 reboot/lockdown HTTP 404; in-process throw/reject only; fuzz confirmed
- copy-only JS rings on this heap (`ipc.stats.copyOnly: true`, `mappedPinnedHostRing: false` live)
- resident not stopped for specialists (only one llama live)
- `vulkanAllThreadCount` unused on this Cursor CPU-only serve

---

## Researcher bind (2026-09-03 ~04:43 PT)

Pass-2 + fixes received. Integrate held until fuzz pass2 and Platform Reviewer land.

- Constraint 1 (F1 sleep after PolicyGate `release`): **binds**
- Constraint 3 (F13 restore only when RF2 refs=0 and slot idle): **binds**
- Constraint 4 (F22 logger drop `{ok:false}`): **binds**
- Constraint 2 rewritten: **refuse oversubscribe**, do **not** drop nexus to `--threads 2`. 4 default / 6 sprint. Tree stays unpatched. Next pass is their folded refinement, not a fork.

## Priority unchanged

1. RF1 PolicyGate (S1)
2. RF2 in-flight refcount (P4/P5/P6/L2/G3)
3. RF3 machine thread budget: keep nexus 4, refuse oversubscribe (L3/P10) — same PR as covert F5
4. RF4 health/PID/port (P1/P2/P3)
5. RF5 success-after-complete + peek slot wait (G2/G3)
6. RF6/RF7 one publish + fail-closed logger/mailbox kinds (G1, LOG1, B12)
7. RF8 wait/seq identity (I2/I3/D2)

---

## Pending: Platform Reviewer (sixth board)

Researcher 2026-09-03: include `/workspace/reviews/platform-review.md` (paths, signals, OS seams) on this pass **when it exists**. File was **missing** at 11:41Z (04:41 PT). Do not invent OS findings ahead of that board.

When it lands: delta-fold path/signal/OS-seam races into this file and `/workspace/reviews/race-fixes.md` (SIGSTOP vs Windows, `taskset`/affinity, `MAX_PATH`, spawn stdio, port bind, `nproc` vs Cursor 4-CPU). Ping Researcher after the delta. Same joint-submit rule. Do not fork a parallel OS story away from their integrated refinement.

---

## Delta: fuzz pass-2 + platform pass-1 (2026-09-03 ~04:45 PT)

Fuzz: `/workspace/reviews/fuzz-pass2.md` + `fuzz-fixes.md`. Platform: `/workspace/reviews/platform-review.md` (25 lines, two criticals; may still grow). Live re-check after those boards.

### Live now

| | |
|---|---|
| gateway | still node `1849424` `:8080` |
| nexus | llama `1903795` `:8187` `--threads 4` (was `1849480` at pass-2 start; PID changed, gateway did not) |
| specialist | llama `1904007` `:8184` `general-text-speculator` `--threads 4 --no-warmup` |
| Σ threads | 4+4=8 on 8-way — **admitted** under RF3 operator lock |

Nexus restart without gateway restart is P1-adjacent (health could have been the old PID). Two live llamas: pack `stop.sh` only kills 8080/8187 (PLAT-S1).

### Fuzz pass-2 → race IDs

| Fuzz | Race | Note |
|---|---|---|
| p060 drain reentry 50001 callbacks / 64ms, livelock=true | **RACE-M1 reproduced** | Was latent (`listeners:0` on gateway). Harness attached a pushing listener. RF7 is no longer theoretical. |
| r002 TE-chunked GET `/health` hang **15002ms** (pass 1 ~6s) | LIVE-H1 / RF9 | Worse this run. Fail-fast, do not wait for a GET body. |
| Fuzz-3 GET-family ignores method | LIVE-H2 / RF9 | Confirmed POST/PUT/PATCH/DELETE still 200. |
| Fuzz-4 mailbox lockdown `ok:true` | G1 / RF7 / B12 | Reconfirmed. |
| Fuzz-13 HEAD `/health` 1ms this pass | LIVE-H1 | Pass-1 6s was client-dependent; TE is the real stall. |
| llama pid 1849480 → 1903795, gateway stayed | P1/P2 | Child replaced under a live 8080. |
| Fuzz-1/2 `messages` 500 / string-iterate | not a race | Leave to fuzz-fixes. |
| Fuzz-5 throw `complex-last` | stubs SAFE for 8080 | B4/Fuzz-5 own the reject-vs-throw shape. |

Fuzz-fixes already cross-link RF7 (Fuzz-11) and RF9 (Fuzz-13). Do not double-implement.

### Platform pass-1 → race IDs

| Plat | Race | Note |
|---|---|---|
| **PLAT-S1** CLI `stop` is a new empty ProcessManager; `stop.sh` POSTs missing `/stop` then `fuser -k` **only** 8080+8187 | RF4 / P1 | Live leftover `:8184`. Next start can probe the orphan. Fix: reap every owned llama port, wait bind-free. Do not advertise `/stop` until it exists. **Do not run `stop.sh` now** (would miss 8184 and still RACE-P1). |
| **PLAT-I1** BSD/Darwin `start.sh` accepts PATH llama then Node spawns pack Linux ELF; `LD_LIBRARY_PATH` clobbered | liveness on non-Linux | Spawn exec-format fail or wrong `.so`. Race pack does not rewrite host adapters; Platform owns the command rewrite. We only need spawn-fail to not leave a `stopping` record on the port (RF4). |

Constraints 1/3/4 still bind. RF3 still 4 default / 6 sprint, refuse oversubscribe (live 4+4 on 8-way matches). Tree unpatched. If `platform-review.md` grows past these two findings, fold the rest on the next wake.

### Platform board growth (11:46Z)

`platform-review.md` is 34 lines (was 25). New complete finding:

| Plat | Race | Note |
|---|---|---|
| **PLAT-P1** missing env keys → empty paths (`util.mjs:32-40`; pack cursor `${GRZ_ROOT}` / `${GRZ_EXE}`) | RF4 + B14 | Spawn becomes `/runtime/llama-server`. Fail-closed expansion is Platform/B14/Fuzz-10. Race only: that failed spawn must not leave a `stopping` record or occupy a port (already RF4). Do not duplicate the expander rewrite. |

Board still has no Medium/Low/SAFE; may grow. Will fold again if it does.
