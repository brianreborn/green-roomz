# Green-Roomz covert-channel review — pass 2

Leak report only. No recipes, no PoCs, no encode/decode, no timing procedures. Tree not patched.

Date: 2026-09-03 ~04:37 AM PT.
Baseline: `/workspace/reviews/covert-review.md` (duplicate `covert-channel-review.md`).
Defense pack (do not fork): `/workspace/reviews/covert-fixes.md` — **design only**, “Do not patch the tree yet”.
Sibling boards read: `race-review.md`, `boundary-review.md`, `fuzz-review.md`.

Trees: `/workspace/green-roomz` (git) and `/workspace/e2e-fresh/green-roomz` (live pack). Live serve is the e2e-fresh binary + model with git `src/` (cites below are git tree; live `src/` of the running gateway was not separately hashed this pass).

---

## Method

- Re-read pass1 CC-1..CC-27 against current `src/` (spot-check; Fixer also states tree unpatched).
- Re-read sibling boards for overlap, missed leaks, contradictions.
- Observe live `127.0.0.1:8080` and `127.0.0.1:8187` with **GET-only** inventory (health/metrics/models/props/monitor/recent/slots). No inference POST from this pass. Fuzz Tester already exercised monitor-alias chat and `max_tokens=1`.
- `taskset -cp` on the live PIDs. `serve.log` tail. Manifest `checkpoint_dir` / `council_dir` / env.

---

## Live snapshot (2026-09-03 11:37Z)

| listener | pid | notes |
|---|---|---|
| `127.0.0.1:8080` node `bin/green-roomz.mjs serve --manifest config/agents.cursor.json` | 1849424 | affinity `0-7` (11 threads) |
| `127.0.0.1:8187` `llama-server --host 127.0.0.1 --parallel 1 --poll 0 --threads 4 --alias tool-router-agent` | 1849480 | affinity `0-7` (15 threads). Binary under e2e-fresh `runtime/` |

No other llama ports. `GREEN_ROOMZ_*` / `CHECKPOINT` / `COUNCIL` / `API_KEY` absent from gateway environ. Manifest `checkpoint_dir` / `council_dir` unset. No API key.

Gateway GET headers: `content-type` + `content-length` + Date/Connection only. **No** `Server-Timing`, **no** `x-green-roomz-*` on these GETs.

---

## Pass1 status

All CC-1..CC-27 still match current source. No cite drift found on the checked hooks (`proxy.mjs:30,80,107-110`, `util.mjs:137-141`, `gateway.mjs:176-181,359-365,417-445,767-777`, `process-manager.mjs:136-137,346-350`, `mailbox.mjs:31-38`, `agents.cursor.json:20,28-31`).

Fixer already mapped every CC-id to a defense (`covert-fixes.md` “Finder-board match”). Pass2 does not relitigate that mapping.

---

## New / strengthened (this pass)

### CC-P2-1 llama.cpp `/slots` on the agent port (high)
- file: live `GET http://127.0.0.1:8187/slots` → 200, 1 slot; source launch `config/agents.cursor.json:28-29`, `src/process-manager.mjs:158,231`; gateway does **not** proxy `/slots` (`src/gateway.mjs:353-354` → 404)
- leaks: `id`, `n_ctx`, `is_processing`, `id_task`, `n_prompt_tokens` (live: 122), `n_prompt_tokens_processed`, `n_prompt_tokens_cache`, `next_token[]`, full sampler `params` including `timings_per_token`, `n_keep`, `stream`, `seed`
- to: any loopback process (CC-10), not the 8080 client unless they also open `:8187`
- notes: strengthens CC-10. Prompt-size and cache-occupancy of slot 0 are directly readable. llama `/metrics` is **501** (“Start it with `--metrics`”) — negative for that path, as pass1 said.

### CC-P2-2 llama.cpp identifies itself on loopback (medium)
- file: live `:8187` response `Server: llama.cpp`; `data/serve.log` start-fail tail: `CORS is set to allow all origins ('*') and no API key is set`; `verbosity = 3`; model path
- leaks: runtime identity, CORS-open warning, model filesystem path, verbosity
- to: loopback HTTP client of `:8187`; local readers of `data/serve.log` (CC-21)
- notes: `:8187/` returned 415 “gzip is not supported by this browser” (webui-ish). Aligns with Fixer F14 (`--no-webui`, inherit API key).

### CC-P2-3 Unauthenticated dump endpoints ignore method (medium)
- file: `src/gateway.mjs:356-385` (health/models/props/metrics/monitor/recent run **before** the POST-only check at `:386`); fuzz `fuzz-review.md` h007–h010, h012–h015
- leaks: same bodies as GET. Fuzz: POST/PUT/DELETE `/health` and DELETE `/v1/models` still 200. HEAD `/health` 200 with ~6013 ms vs GET ~12 ms (Keep-Alive `timeout=5` in gateway headers).
- to: HTTP client (no API key)
- notes: method is not a gate. Duration difference on HEAD is a live timing signal; no recipe here.

### CC-P2-4 `/health` `/metrics` `/v1/monitor/recent` live contents (high — confirms CC-5, CC-7, CC-15)
- file: `src/gateway.mjs:359-365,417-445`; live bodies
- leaks:
  - `/health` 200 `degraded`, `uptime_ms` 1344023, `policy` responsive, 11 agents with availability/caps/resident, mailbox `{capacity:256,size:0,pushed:3,dropped:0,drained:3,seq:3,listeners:0}`, ipc `{copyOnly:true, mappedPinnedHostRing:false, hot.pushed:3, upcalls.size:0}`
  - `/metrics` 277 bytes: `in_flight:0`, `queued:0`, **`sessions:31`**, process `{alias:tool-router-agent, pid:1849480, state:ready, profileId:cpu-4, resident:true}`, `totalMemoryBytes`/`freeMemoryBytes`/`loadAverage`
  - `/v1/monitor/recent` 1644 bytes: **3 foreign hops** with `ticket` UUIDs, `ts` (ms), `reason` (`pangolin` / `mailbox` / `lock_alias`), `hops[]`, plus matching IPC copies (`seq` `{hi,lo}`)
- to: HTTP client with no token (B1). Tickets are live session ids (B8) — leak, not a how-to.
- notes: `mappedPinnedHostRing:false` live-confirms no mmap ring. `listeners:0`. Content-Length equals real JSON size (unpadded).

### CC-P2-5 Shared identity + monitor dump (high — sibling B8/B3, leak view)
- file: `src/gateway.mjs:35-43,359-365,471-487,1057-1066`; `src/nexus.mjs:151-187`; fuzz c041 monitor snapshot 200
- leaks: session UUID in hop `ticket` is enough correlation for another `loopback-dev` client; nexus may select `security-monitor-agent` (logical, always ready) and return `mailbox.recent()` as chat `content`
- to: HTTP client; model-chosen route (B3) as well as explicit pin
- notes: Fixer F11 (“HTTP mailbox dump is session-local or gone”) covers this. Do not fork.

### CC-P2-6 U+2028 / U+2029 survive `stripControls` / `headerSafe` (medium — sibling B18)
- file: `src/util.mjs:129-146` (`C0_C1` is `\u0000-\u001F\u007F-\u009F` only)
- leaks: Unicode line separators in `x-green-roomz-requested-alias` and in consult/HANDOFF `reason` text that is later spliced into the nexus prompt
- to: HTTP client (header); subsequent nexus turn (prompt split)
- notes: pass1 CC-2 covered ZW/homoglyphs/trailing space in **completions**. This is the header/reason cousin. Fixer F4 already adds U+2028–U+202E to `COVERT_FORMAT`.

### CC-P2-7 Upstream headers forwarded on stream/direct-alias (medium — sibling B19, extends CC-1)
- file: `src/proxy.mjs:21-24,91-107`; `src/gateway.mjs:505-520,921-936,1127-1129`
- leaks: any non-hop-by-hop llama.cpp response header (`Server`, CORS, `set-cookie`, `location`, possibly `Server-Timing` if that build emits it) can replace gateway `x-green-roomz-*` on `writeHead`
- to: HTTP client on resident-fallback / direct-alias / text-fallback proxy paths
- notes: GET inventory on `:8080` does not show this (those paths are inference). Live `:8187` already sends `Server: llama.cpp`.

### CC-P2-8 `/health` echoes expanded artifact paths (medium — sibling B16)
- file: `src/registry.mjs:34-37`; `src/gateway.mjs:357-368,417-425`; live `/health` `unavailable_reasons`
- leaks: `runtime:<command>` and `model:<path>` after `${}` expansion. Shipped manifests leak `GRZ_ROOT`/`HOME` layout, not secrets. A hostile manifest could interpolate a secret-named env key into those fields.
- to: HTTP client
- notes: live health listed several `unavailable` specialists with reason strings (inventory channel).

### CC-P2-9 Logger `read` with omitted role dumps the chain (low — sibling B13)
- file: `src/monitor/logger.mjs:75-79,168-169`
- leaks: in-memory hop chain if `callerRole` is omitted (`assertCaller` skipped)
- to: in-process caller (HTTP does not call logger)
- notes: strengthens CC-27. Fixer F22.

### CC-P2-10 Affinity is the full machine (high — live confirm CC-11 / RACE-L3)
- file: `src/process-manager.mjs:20-27,275-277`; `src/hosts/windows.mjs:40-47`; live `taskset -cp` → `0-7` for **both** node and llama
- leaks: architectural — co-resident processes share LLC and the full logical CPU set. Live llama `--threads 4` with 8-CPU affinity list; only one llama up so this snapshot is 4 GGML threads, not the 8-on-4 oversubscribe (that needs a warm specialist).
- to: the other co-resident process when a specialist is also live
- notes: `--parallel 1` still means **not** one shared llama-server for 4+4. Isolation failure is host LLC + overlapping affinity.

### CC-P2-11 CORS port-80 origin can read dumps (medium — sibling B7)
- file: `src/gateway.mjs:140-148`; `config/agents.cursor.json:16-19`
- leaks: allowlist is `http://localhost` and `http://127.0.0.1` **without a port** (port 80). A page on that origin can **read** `/v1/monitor/recent`, `/metrics`, `/props`, completion bodies.
- to: browser on port-80 localhost (plus any HTTP client; B1 already covers non-browser)
- notes: CORS is not `*`. llama.cpp on `:8187` **does** warn CORS `*`.

---

## Sibling cross-walk

| sibling | covert overlap | conflict? |
|---|---|---|
| Boundary B1 | unauth loopback = full observer of dumps/metrics | no — we under-weighted “no API key is the default” as a leak multiplier |
| Boundary B3 | nexus can pick monitor → mailbox dump as chat | new CC-P2-5 |
| Boundary B7 | port-80 CORS read of dumps | new CC-P2-11 |
| Boundary B8 | tickets = reusable session ids | new CC-P2-5 |
| Boundary B16 | health path echo | new CC-P2-8 |
| Boundary B18 | U+2028/2029 | new CC-P2-6 |
| Boundary B19 | upstream header forward | new CC-P2-7 |
| Boundary B24 | nested mailbox payload not hashed | already CC-19 |
| Race RACE-L3 | 8 GGML threads / no affinity | already CC-11; live affinity `0-7` |
| Race RACE-L2 | `/slots/0` save vs live hop | CC-13 dormant (no checkpoint_dir); live `/slots` still readable (CC-P2-1) |
| Race RACE-I3 / LIVE-I1 | reject cache unbounded | already CC-20 |
| Race RACE-G1 | mailbox vs IPC split brain | leak: `/v1/monitor/recent` can show divergent seq spaces (number vs `{hi,lo}`) — seen live, both copies present with matching tickets |
| Fuzz h013/h015 | `/metrics` and `/v1/monitor/recent` 200 | live-confirmed |
| Fuzz h007–h012 | method-agnostic dumps; HEAD ~6s | new CC-P2-3 |
| Fuzz c041 | monitor-alias snapshot 200 | confirms CC-5 / CC-P2-5 |
| Fuzz c042 | resident `max_tokens=1` 74ms | not a tok/s dump; did not inspect body `timings` this pass |
| Covert-fixes | F1–F23 cover CC-1..27 plus B18 unicode | **aligned**; do not fork. Tree still unpatched. |

---

## Fixer alignment (leave defense to Covert Channel Fixer)

Pass2 leak adds that Fixer should fold (ids for Researcher, not a new defense fork):

- **CC-P2-1** `/slots` on `:8187` — F14 should include bind/auth **and** disable or gate `/slots`, not only `--no-webui` / `--metrics`.
- **CC-P2-3** dumps are not GET-only; HEAD duration.
- **CC-P2-5** nexus→monitor dump (B3) in addition to explicit pin.
- **CC-P2-7** header allowlist (already hinted in F8a / B19).
- **CC-P2-8** health `unavailable_reasons` paths.

Everything else in pass1 already has an F-number. Researcher integrates; next pass follows their refinement.

---

## Negatives re-confirmed live

- Gateway does **not** author `Server-Timing` / `tokens_per_second` on GET inventory.
- Gateway `/slots` 404.
- llama `/metrics` 501 without `--metrics`.
- `ipc.mappedPinnedHostRing === false`; rings copy-only.
- Mailbox `listeners: 0`; `size: 0` after drain; `recentBuf` still holds 3 hops.
- `checkpoint_dir` / `council_dir` off; no `--slot-save-path` on the live argv.
- Live argv includes `--poll 0` (cursor.json). Only **one** llama-server (resident). Warm cap 1 not occupied.
- `Retry-After` not on 200 inventory.

Not probed this pass (avoided turning observation into a recipe): stream `timings` JSON, ZW in a completion, image/WAV bodies, council JSONL, checkpoint `.bin`. Those remain source-backed from pass1.

---

## Severity delta vs pass1

Hold pass1 severities. Raise the **operational** weight of CC-5/CC-7/CC-10 because they are live with no key and with foreign tickets already in the ring. CC-13/CC-12 disk channels stay dormant on this serve.

---

## Errata (sibling cross-read, same turn)

Cite check of pass1 items 1–10: **no drift**. e2e-fresh `src/` matches; portable manifest only differs `manifest_version` and llama `command` (`${GRZ_ROOT}/...`).

### Cite correction
- Pass1 CC-19 listed `src/util.mjs:148-155` next to envelope size. That line is `jsonResponse` (unpadded `content-length`). `packSlot` is `src/monitor/ids.mjs:7,97-106` (16-byte seq+ticket, unused by `CopyRing`). Live dump size is still the JSON `content-length` of `/v1/monitor/recent`.

### CC-P2-12 `--poll 0` is cursor-only (medium)
- file: `config/agents.cursor.json:38-39` has `"--poll","0"`; android/windows/note9 `base_args` omit it; `src/process-manager.mjs` `buildLaunch` does not inject
- leaks: idle llama-server may busy-wait on those hosts (shared LLC / cache-line with co-resident agents)
- to: co-resident process on android/windows/note9
- notes: Fixer F6. Live cursor serve **does** pass `--poll 0` (argv confirmed).

### CC-P2-13 `keepReasoning` skips `stripEscapes` on reasoning fields (medium)
- file: `src/proxy.mjs:36-50`; `src/gateway.mjs:182-191`
- leaks: when `enable_thinking` / `keepReasoning`, `reasoning` / `reasoning_content` are not run through `stripEscapes` (ZW/CSI/LS remain)
- to: HTTP client of that completion
- notes: extends CC-2. Non-stream still deletes top-level `timings`.

### CC-P2-14 Array `message.content` parts never stripped (medium)
- file: `src/proxy.mjs:41,50` (`typeof message.content === 'string'` only)
- leaks: multipart `content` (text / image_url parts) bypass `stripEscapes`
- to: HTTP client
- notes: extends CC-2 / CC-3 store.

### CC-P2-15 Empty profile `{args:[]}` → llama `hardware_concurrency` (medium — race RACE-L3)
- file: `src/process-manager.mjs:91-93`
- leaks: missing profile args leave thread count to the binary (all logical CPUs), amplifying CC-11
- to: co-resident agents on that host
- notes: Fixer F5. Cursor shipped profiles do set `--threads`.

### CC-P2-16 Hostile `extra_args --host 0.0.0.0` (low unless manifest tampered — B23)
- file: `src/process-manager.mjs:306`; `src/config.mjs` expansion
- leaks: CC-10 loopback assumption fails if `extra_args` (or expanded env) bind all interfaces; then `/slots` (CC-P2-1) is off-box
- to: any reachability of that bind
- notes: shipped cursor.json is `--host 127.0.0.1`. Not a shipped default.

### CC-P2-17 Sanitize parse-failure forwards raw body (medium)
- file: `src/proxy.mjs:96-97`
- leaks: if upstream JSON parse fails, unsanitized raw (including `timings`) is sent
- to: HTTP client on the non-stream proxy path
- notes: extends CC-1.

### Also named by siblings, already in this file
- TAG/VS supplementary: Fixer F4; we had LS/PS as CC-P2-6 only — same `stripEscapes` gap, charset larger than ZW.
- Fuzz treated `/v1/monitor/recent` 200 as “allowed read-only.” Same bytes as CC-5; we still rate it High as a cross-session leak.
- Fixer prose “Nexus is `--threads 2`” is Windows/APU. Cursor nexus is `--threads 4` (`agents.cursor.json` cpu-4). Race agrees with us.

Homoglyph residual of CC-2: Fixer will **not** fold confusables. Leak remains after F4.
