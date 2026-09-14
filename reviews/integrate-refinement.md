# Green-Roomz integrate refinement

Date: 2026-09-03 ~04:49 PT. Researcher stitch. Tree still frozen: **do not patch `src/`**, do not stop `:8080`/`:8187`, no git commit/push.

Sources (all read): `race-{review,pass2,fixes}.md`, `boundary-{review,pass2,fixes}.md`, `covert-{review,pass2,fixes}.md`, `fuzz-{review,pass2,fixes}.md`. Platform pass-1 is on disk (`platform-review.md`, no pass2/fixes yet) — folded below as **pending-but-present**, not this security cut.

Apply after Platform Reviewer lands, **or** as beta-0.3 if the operator says go.

---

## Bindings (do not fork)

- **Race order:** RF1 PolicyGate first, then RF2 refcount, then RF3. Covert **F1** `holdMs` sleep **after** PolicyGate `release()`, not inside the acquired hop / `proxyJson`. **F13** restore only when RF2 `refs=0` **and** slot `is_processing=false`. **F22** logger cap must `{ok:false, dropped:true}` on drop (not `ok:true`).
- **Threads (this Cursor 8-core box):** 4-thread resident **default**, 6-thread **sprint**. Σ live llama `--threads` ≤ `os.cpus().length`. Refuse oversubscribe (`cpu-6` when remaining < 6). **Do not drop nexus to 2** here. Empty CPU set = **do not spawn** (no wrap, no retry). Windows nexus `cpu-2` + vulkan-all rewrite stays that manifest only.
- **Fuzz P0:** POST `/v1/chat/completions/route` `messages=number` (also bool/object/string) → **400** `validation_error`, never 500. `Mailbox.push` kind allowlist: `lockdown`/`reboot`/`vote` not `ok:true`. GET-family must honor method (no POST `/health` 200).
- **Boundary this cut:** JSON `Content-Type: application/json` on mutating routes; CORS default empty + OPTIONS **after** `peerAllowed`; `sessions.patch` field allowlist; hashed tickets on monitor dump; dump routes GET-only. **Do not add an API-key product in v1** unless listed P2 — **loopback remains the operator trust boundary**; non-loopback fail closed (`allow_peers` / public bind). Never mint `'loopback-dev'` for a non-loopback peer.
- **Covert:** strip `timings` from **client streams** (not only buffered JSON). F4 `stripControls`/`headerSafe`/`stripEscapes` include **U+2028/U+2029**. F14 also **gate llama `/slots`**. HEAD fail-closed (not ~6s parser wait). Publish-after-complete. `extra_args` must not bind `0.0.0.0`. Homoglyphs **stay after F4** — do not invent a homoglyph decoder.
- **lockdown/reboot:** HTTP **404 is OK** for uncallable. In-process must **reject envelope** (`kind:'reject', ok:false, executed:false`), never `ok:true` no-op, never throw-as-success. **8080 never owns reboot.** Gateway mask stays `CAP.POST|OBSERVE|SNAPSHOT`.

---

## Apply order (this cut)

1. RF1 PolicyGate settle-once (+ council `acquire`)
2. RF2 hop refcount (unlocks evict/sweep/slot/peek/F13)
3. RF3 + covert F5: keep nexus 4; refuse oversubscribe; empty set → no spawn
4. HTTP shape: Fuzz-1/2 `messages` array, F-B2 JSON CT, F-B30/Fuzz-3 GET-only dumps, F-B7 empty CORS + OPTIONS peer-gate
5. RF5 / F27 publish-after-complete; F1 sleep **after** `release`; peek wait slot idle
6. RF6/RF7 + F-B12/Fuzz-4 one publish; mailbox kind allowlist; F22 logger `{ok:false}`
7. F4 LS/PS; F14 `/slots` gate + no `0.0.0.0`; RF9/F24 HEAD fail-closed
8. F-B8 hashed tickets + `sessions.patch` allowlist; F-B4/Fuzz-5 reject envelopes

Tests land with each item. No exploit steps, no PoCs, no stego recipes.

---

## P0

| ID | Files (cites) | Expected tests |
|---|---|---|
| **RF1** PolicyGate | `src/scheduler.mjs:17-44`; callers `src/gateway.mjs:923,961`; council `:617-647` | abort before acquire, max full → reject, `active` unchanged; already-aborted fast path does not increment; `responsive` max=1 abort waiter then third acquire proceeds; council takes `acquire` |
| **RF2** in-flight pin | `src/process-manager.mjs:244-268,548-604`; gateway `:925-936,:1048-1079` | pin → sweep/evict skip; unpin → sweep ok; resume without `/health` 200 → restart not `ready`; F13 restore **not** called while `refs>0` |
| **RF3+F5** thread budget | `src/cpu-set.mjs` (new); `src/process-manager.mjs:20-37,91-93,402-418`; `config/agents.cursor.json:134-172,313-350` | Cursor nexus `--threads` stays **4**; `allocateSets(8,[{4},{4}])` disjoint; `allocateSets(8,[{4},{6}])` specialist **empty**; `allocateSets(4,[{4},{4}])` specialist empty → **no spawn**; timed-out `cpu-4` does **not** retry `cpu-6` |
| **Fuzz-1/2 / B27** `messages` | `src/routing.mjs:24-30,:51-52,:64`; `src/logical-router.mjs:5`; `src/gateway.mjs` POST after parse | `messages: 42` / `true` / `{}` / `"hi"` on `/route` **and** `/v1/chat/completions` → **400** `validation_error`, never 500; `[]` / omitted `/route` still 200 |
| **Fuzz-4 / B12 / RF7** mailbox kinds | `src/mailbox.mjs:108-132`; `src/gateway.mjs:448-468` | `push({kind:'lockdown'\|'reboot'\|'vote'})` → `{ok:false}`; hop kinds still enqueue; drain snapshots before listeners (no livelock) |
| **Fuzz-3 / F-B30 / LIVE-H2** GET-only | `src/gateway.mjs:341-385` | POST/PUT/DELETE `/health` `/v1/models` `/metrics` `/props` `/v1/monitor/recent` → **405**; GET still 200 |
| **F-B2 / Fuzz-6** JSON CT | `src/gateway.mjs:386-395` | missing / `text/plain` / empty CT on POST mutating → **400** even if body is JSON |
| **F-B7** CORS empty + OPTIONS peer | `config/agents.{cursor,windows,android,note9}.json:16-19`; `src/gateway.mjs:140-148,:341-344` | default `cors_origins: []`; `Origin: http://localhost` not reflected; OPTIONS from denied peer **403** not 204; no `*` |
| **F-B8** hashed tickets + patch allowlist | `src/gateway.mjs:448-455,:359-365`; `src/sessions.mjs:39-46` | `/v1/monitor/recent` has no UUID-shaped `ticket`; `patch({identity,id,expiresAt})` ignored |
| **RF5 / F27** publish after body | `src/gateway.mjs:503-520,:1096-1101,:1125-1129`; `src/proxy.mjs:70-126`; `src/handoff.mjs:167-227` | fake 504 → last hop `kind !== 'success'`; peek abort → alias once; next hop waits `is_processing===false` |
| **F1 stream timings** | `src/proxy.mjs:30,80,107-110`; `src/handoff.mjs` SSE | client stream chunks have **no** `timings`; `holdMs` runs **after** PolicyGate `release` |
| **F4 / B18** LS/PS | `src/util.mjs:129-146` (`stripEscapes` + `stripControls` + `headerSafe`) | U+2028/U+2029 stripped; one-char class tests only; **no** homoglyph fold |
| **F14** gate `/slots` | `src/process-manager.mjs:158,231,306`; llama argv | `--no-webui`; never `--metrics`; `extra_args`/`profile.args` that would `--host 0.0.0.0` refused; gateway still does not proxy `/slots` |
| **RF9 / F24 / LIVE-H1** HEAD | `src/gateway.mjs:1175-1176` | default `requestTimeout` finite (180s); HEAD `/health` no body wait; TE-no-chunks / CL-on-GET → 400 fast, not ~6s |
| **F22 / LIVE-LOG1** logger drop | `src/monitor/logger.mjs:5-6,82-84,122-123,157-162` | missing path / flood / write fail → `{ok:false, dropped:true}`; cap `chain` |
| **F-B4 / Fuzz-5** uncallable reject | `src/monitor/{ipc,isolate,network,api,policy}.mjs`; template `src/monitor/respond.mjs:326-341` | `ipc.lockdown()` etc. return reject envelope, **no throw**; HTTP `/lockdown` `/reboot` stay **404**; 8080 never imports reboot verbs |

---

## P1

- **RF4** health is this PID; `stopRecord` waits `exit`; `waitForPortsFree` timeout = occupied (`src/process-manager.mjs:402-495,601-619`). Composes with PLAT-S1 leftovers when platform lands.
- **RF8 / F19** IPC stamps occupancy seq; reject cache TTL/cap (`src/monitor/ipc.mjs`, `src/monitor/states.mjs`).
- **F-B9** always prepend stock prompt; drop 24-char `includes` (`src/gateway.mjs:162-173`).
- **F-B20** exact `/v1/chat/completions/route` only; drop `endsWith('/route')` (`src/gateway.mjs:19-30,:194-201`).
- **F-B3 / F11** nexus must not select MONITOR/logical; HTTP recent session-local or empty (`src/nexus.mjs:151-187`; `src/gateway.mjs:1057-1066`).
- **F-B19 / F8a** downstream headers `content-type` only; 8080 stamps win (`src/proxy.mjs:21-24,:91-107`).
- **F-B21 / F18** HTTP `details` / health `unavailable_reasons` are codes, not paths (`src/gateway.mjs:407-412`; `src/registry.mjs:34-37`).
- **F3 / F-B28 / F8** inference allowlist; live `cache_prompt: false`; no `--cache-idle-slots` on serve (`src/gateway.mjs:176-191`; `src/process-manager.mjs:346-350`).
- **F-B5/B6/B10/B11** default-deny caps; grades do not name reboot verbs; reject **before** `setState`; bind role/mask to instance.
- **F-B13 / Fuzz-12** logger: no SAD→monitor rewrite; missing `read` role → reject.
- **F-B14 / Fuzz-10 / PLAT-P1 overlap:** `${}` allowlist (`GRZ_ROOT`,`GRZ_EXE`,`HOME`); `Object.hasOwn`; fail closed on empty command path (`src/util.mjs:32-40`). Platform owns percent-VAR / Darwin NFC / default GRZ_ROOT — **not this cut**.
- **F-B25/B26 / ENT1** entropy/gate: respond verb on credit → reject; unknown source not aliased.
- **F6** inject `--poll 0` on all llama launches.
- **F2** hash-always mailbox/IPC payloads; `publicStats()` occupancy stays in-process.
- **F7/F9/F10** media-scan + native/TTS sanitize (constants/magic only; no stego tests).
- **Council** into RF1+RF2: `policy.acquire`; no parallel unless ready **and** CPU sets non-empty; never evict in-set aliases.

---

## P2

- **F-B1 API-key product** — demoted. Loopback is the v1 trust boundary. Non-loopback fail closed. No default-on bearer mint unless operator reopens this.
- Homoglyph residual of CC-2 after F4 (do not fold confusables).
- F12 `/metrics` strip PIDs/RAM; F15 council `ms`; F16 route headers enum; F17 delete proxied `usage`; F20 `serve.log` tok/s filter; F21 benchmark omit tps; F23 android/note9 `max_warm_specialists: 1`.
- F-B15 path confinement; F-B17 pack SHA-256 extract pin; F-B22 CIDR `/0` reject.
- Copy-only JS rings stay; no SAB/CUDA lock-free port this cut.
- Vote TTL: never default forever; `hrtime` expiry (LIVE-NTP1). No NTP module in v1.

---

## Conflicts you resolved

| Collision | Resolution |
|---|---|
| Covert F5 `NEXUS_THREADS=2` / race “drop resident to 2” vs Cursor `cpu-4` | **Keep nexus 4.** Windows nexus-2 examples stay Windows-only. |
| Race “8-on-4” vs this box `nproc=8` | Live 4 is not oversubscribed here. Still **refuse** `cpu-6` after nexus 4 (remaining 4). On a 4-CPU laptop specialist 4 is refused (empty set, no spawn). |
| F5 wrap-on-exhaust vs empty set | **Do not wrap. Do not spawn.** |
| F1 sleep inside `proxyJson` holds PolicyGate (`responsive` max=1) | Quantize timestamps/frame sizes off-slot; **sleep after `release()`**. |
| F13 “restore after each live hop” vs RACE-L2 busy slot | Restore **only** `refs=0` **and** `/slots` `is_processing=false`. |
| F22 unset path = no-op write vs LIVE-LOG1 `ok:true` on drop | **`{ok:false, dropped:true}`**. Cap chain. |
| Boundary F-B1 default-on bearer as P0 | **P2.** Loopback = operator trust boundary; non-loopback fail closed. |
| Race SAFE “stubs throw” vs B4/Fuzz-5 | HTTP 404 stays. In-process **reject envelope**, not throw-as-success, not `ok:true` inert. |
| Fuzz “GET `/v1/monitor/recent` 200 is allowed” vs CC-5/B8 | Status 200 on GET is OK; **hashed tickets** this cut; session-local/empty dump is P1 F11. |
| Covert F14 `--api-key` on llama vs no API-key product | Do **not** invent a key product. F14 this cut = `--no-webui`, no `--metrics`, **gate `/slots`**, refuse `0.0.0.0`. Inherit key **only if** operator later enables P2. |
| Dual-write G1 vs B12 vs F2 hash | One publish: IPC first; mailbox copy only on `ok:true`; then hash. Race owns drain snapshot; boundary owns reboot-class reject. |

---

## Platform (pending-but-present)

Board: `/workspace/reviews/platform-review.md` (pass 1 complete 2026-09-03; **no** `platform-pass2.md` / `platform-fixes.md` yet). **Not this `src/` security cut.** Do not invent OS findings beyond that file. Windows installer is a **pack** concern, not a security patch.

Present IDs (cite only):

- **PLAT-S1** `bin/green-roomz.mjs:37-38,:341-344`; pack `stop.sh:3-12` — CLI stop is a new empty `ProcessManager`; `stop.sh` `fuser -k` **only** 8080/8187; live leftover llama **`:8184`**. Next start can RACE-P1-probe the orphan. Reap owned ports 8181–8187, wait bind-free.
- **PLAT-S2** pack `stop.cmd` kills **every** `llama-server` image (too wide on Windows); Linux stop too narrow; win32 SIGTERM=TerminateProcess; no SIGHUP handler (`bin/green-roomz.mjs:152-153`).
- **PLAT-S3** Termux `pkill -f` does not wait / does not reap wrap children (`termux-start.sh`).
- **Path:** PLAT-P1 empty `${}` → `/runtime/llama-server` (same hole as B14; this cut owns allowlist fail-closed); PLAT-P2 git cursor box-absolute vs pack `GRZ_ROOT`, default `loadManifest` = `agents.windows.json`; PLAT-P3 Termux copies GGUF to HOME then still mmaps `/data/local/tmp`; PLAT-P4 MAX_PATH / reserved names / mixed separators; PLAT-P5 spawn clobbers `LD_LIBRARY_PATH`, no `cwd=GRZ_ROOT`.
- **Installer seams:** PLAT-I1 FreeBSD/Darwin `start.sh` accepts PATH llama then Node still spawns Linux ELF; PLAT-I2 `start.cmd` still copies vulkan LocalAI; PLAT-I3 `package.json` start + mode 644 shebang; PLAT-I4 robocopy/shortcut/uninstall races.
- **l10n:** PLAT-L1 0.5B Qwenstral is English-framed / ASCII-routed / forbidden translator (capacity+policy, not missing CJK vocab); PLAT-L2 locale fold / bidi in reasons (F4 already strips U+2028–U+202E this cut; do not add a translation-agent alias).

When pass2/fixes land: delta-fold **only** into RF4 port-free + launcher pidfile/port-reap. Do not fork a parallel OS story. **Do not stop live serve to “prove” PLAT-S1.**

---

## Not this cut

- Platform path/signal/l10n/installer (above). Windows installer = pack, not a security patch.
- Memory-frame L0–L3 — already in `policies/frames`.
- Homoglyph decoder; CUDA/SAB lock-free ring; raising `--parallel` above 1.
- Enabling lockdown / reboot / vote / `secure_reboot`. HTTP 404 stays.
- API-key product (P2). Git commit/push. Patching `src/` in this turn.

---

## Done when (beta-0.3 gate, if operator says go)

- `responsive` abort cannot stick PolicyGate `active`.
- Live hop cannot be SIGSTOP’d / checkpointed / F13-restored.
- 4-CPU box cannot launch 4+4; 8-way admits 4+4 and refuses 4+6; nexus stays 4.
- `messages=number` → 400; mailbox lockdown kinds `ok:false`; POST `/health` → 405.
- Mutating POST without JSON CT → 400; CORS default empty; HEAD not a multi-second stall.
- Client streams have no `timings`; logger drop `ok:false`; in-process reboot-class is a reject envelope; 8080 still cannot reboot.
