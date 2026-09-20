# Silent defaults (same class as timing_privacy)

Class: a missing or zero operator choice that quietly picks **max security / max RAM / max threads / max thoroughness**, especially when the sleep or spawn does **not** sit on the threat’s observer path.

Filter: qodesh Windows dogfood — Athlon II X2 (2 logical), 16 GB, **CPU llama only**, never GGUF on the 8600 GT. Live cut is `config/agents.windows-mvp.json`. `config/agents.windows.json` is the shalom/Vulkan pack; it is in-tree and will be used if someone omits `--manifest` discipline.

Landed in-tree (no serve bounce): required install keys, `admit_when_tight=refuse` restores `impractical`, `apply_store_winners` defaults off, empty profiles inject `--device none`, idle `0` evicts immediately, PolicyGate ctor `responsive`, thinking off unless client `true`, council parallel only if `parallel: true`, nexus/peek timeouts from manifest (MVP 10s/8s), DEFAULT_MANIFEST is `agents.windows-mvp.json`, vulkan-all CPU fallback 1.

## Already handled this pass (do not re-fix)

| Finding | Default today | Observer | On that path? | Key |
|---|---|---|---|---|
| `timing_privacy` missing used to pad | **Required** `off \| next_acquire \| response`. MVP is `"off"`. Remainder is `[0, q)`; no `pad + U[0,q)`; no `0 → q`. | Cross-box = HTTP TTFB (`response`, before first byte). Same-host = PolicyGate/CPU after `release()` (`next_acquire`). | Only if the matching mode is set. `off` sleeps nowhere. | `gateway.timing_privacy` (required). Optional `timing_privacy_quantum_ms`, `timing_privacy_dither`. |
| Empty-profile `--threads 4` on 2-CPU Athlon | `defaultThreadCount()` = `min(DEFAULT_THREADS=4, logical CPUs)`. `implicitThreadCount()` further clamps to remaining CPU set. | Same-host CPU occupancy / oversubscribe. | Spawn path, not HTTP. Explicit profile `--threads` unchanged. | Profile `--threads`. Do not raise `DEFAULT_THREADS`. |
| `max_warm_specialists` unset = **all** llama specialists | Still the code default: count of non-resident `llama_server` agents (at least 1). MVP sets **1**. | Same-host RAM/CPU (warm mmap set). Not cross-box TTFB. | Idle sweep + `evictForNewSpecialist` only. | **Require** `gateway.max_warm_specialists` the way timing_privacy is required. Athlon keep `1`. |

## Open — same class

| Sev | Finding | Default today | Observer | On that path? | Suggested explicit key |
|---|---|---|---|---|---|
| **bug** | RAM admission no longer vetoes. `profileAdmitted` always `ok: true` (“load anyway; let the OS page”). `AgentRegistry.inspect` never writes `impractical:*`. Tests still expect a veto (`test/memory.test.mjs`, `test/registry.test.mjs`). Combined with unset `max_warm`, a present 4B/7B file will mmap. | Always admit if the artifact exists. `min_free_bytes` (default 384 MiB) is the only hard spawn floor. | Same-host RAM / paging / Athlon lockup. Cross-box only as a multi-minute TTFB if the box thrashes mid-turn. | `ensure`/`start` hot path once the GGUF exists. Auto-route still skips **cold** non-fallback specialists (`mayColdStart`); `/code` slash and an already-warm specialist do not. | `gateway.admit_when_tight` (`refuse` \| `page`). Restore `impractical` unless the operator sets `page`. Keep `gateway.min_free_bytes`. |
| **bug** | Serve auto-applies `data/benchmarks.json` winners (`applyStoreWinners` in `bin/green-roomz.mjs`). Store on this disk prefers **`vulkan-all`** for `general-text-speculator` and `qwenstral-code-speculator`. Objective fallback is `'throughput'` (maximize scoring). | Silent Vulkan0 pin if that profile id exists on the agent. MVP profiles are only `cpu-1` / `cpu-1b` (preferred id misses → no-op). `agents.windows.json` **has** `vulkan-all` first. | Same-host 8600 GT VRAM (display-only). Not a remote timing control. | First `ensure` of that alias. | `gateway.apply_store_winners` (`off` default) or `--no-store-winners`. On qodesh, never select `vulkan-all` / `Vulkan0`. |
| **bug** | Empty `profiles: []` → `{ id: 'default', args: [] }`. No `--device none` / `--n-gpu-layers 0`. Relies on runtime `GGML_VULKAN=0`. A vulkan `GRZ_LLAMA` without that env (or a later profile that only sets threads) can hit the 8600. | Implicit CPU threads only; device is the binary’s default. MVP chat + nexus already pin `cpu-1`. Vision/embed/rerank/safety/speech/image-gen lists are empty. | Same-host GPU. | Spawn of those aliases **if** artifacts become admittable. | Install: copy the `cpu-1` arg block before enabling a file. Code: inject `--device none --n-gpu-layers 0` on the synthesized default, or refuse empty llama profiles. |
| **bug** | `config/agents.windows.json` is `policy: maximize` and **omits** `max_warm_specialists` and `idle_evict_ms`. That is the “all specialists, no in-flight cap, 5 min keep-warm” combo on a 2-CPU box if this file is the serve manifest. | Explicit maximize in that JSON; silent unlimited warm from code. MVP is `responsive` + `max_warm_specialists: 1` + `idle_evict_ms: 120000`. | Same-host CPU/RAM. Cross-box as hung TTFB under thrash. | Whole serve. | Do not serve this file on qodesh. If kept: `policy: responsive`, `max_warm_specialists: 1`, no vulkan profiles. |
| **suggestion** | `idle_evict_ms` missing → **300_000**. **`0` disables the sweeper** (`idleEvictMs <= 0` → never start; sweep idle-time branch never fires). That is `0 → max keep-warm`, the same shape as old `wait===0 then wait=q`. Over-cap eviction still runs only if `max_warm` is set. | 5 min keep, or forever if 0. MVP 120 s. | Same-host RAM. Not client TTFB. | Idle timer, 30 s interval. | Require `gateway.idle_evict_ms`. Treat `0` as “evict when idle immediately” or refuse 0. Athlon: keep 120000. |
| **suggestion** | `PolicyGate` constructor default `'maximize'` (`maxHeavyInFlight = Infinity`). Manifest **requires** `gateway.policy`, so `serve` is gated. Tests/`sampleManifest` still default maximize. `bin` `objective ?? 'throughput'` if policy is weird. | Unlimited concurrent heavy turns unless the JSON says otherwise. MVP `responsive` (1). | Same-host CPU (Athlon cannot overlap two llama forwards). Cross-box: second client waits on the slot only under `responsive`/`balanced`. | Acquire on every inference. | Keep policy required. Change ctor default to `'responsive'`. Do not use maximize on Athlon. |
| **suggestion** | `NEXUS_CONSULT_TIMEOUT_MS = 25_000` hardcoded. Live consult is a **non-stream** JSON completion, `NEXUS_MAX_TOKENS = 96`. At ~3 tok/s that is ~32 s of work; the client often waits the full 25 s then falls back to `offlinePlan`. | 25 s stall before first specialist/chat token on unslashed turns. | **Cross-box TTFB** and same-host PolicyGate (responsive = 1). **On the observer path.** | `consultNexus` before hop. Slash/lock skip it. | `gateway.nexus_consult_timeout_ms` (install). Athlon: 8–12 s is enough to prefer the offline plan. |
| **suggestion** | `HANDOFF_PEEK_TIMEOUT_MS = 20_000`, `HANDOFF_PEEK_CHARS = 48`. First ~48 chars at 3 tok/s ≈ 16 s. | Adds up to 20 s **on TTFB** of a specialist hop before keep vs HANDOFF. | Cross-box TTFB; same-host occupancy. **On path.** | `peekSpecialist` after `ensure`. | `gateway.handoff_peek_timeout_ms` / `handoff_peek_chars`. |
| **suggestion** | `UPSTREAM_TIMEOUT_MS` and `server.requestTimeout` default **180_000** if the JSON omits them. MVP omits both (cold_start/retry_deadline are 180 s). A hung llama holds the **responsive** slot for 3 minutes. | 180 s. | Cross-box total time; same-host next acquire. **On path** for a stall. Normal Athlon 0.5B replies are well under this. | proxy + native + listen. | Require `gateway.upstream_timeout_ms` and `request_timeout_ms` (or inherit cold_start). |
| **suggestion** | `jitteredBackoff` is `max(1, …)` — never 0. Used on **503 + Idempotency-Key** and **ECONNREFUSED** until `retry_deadline_ms` (MVP 180 s). Not a privacy pad, but it is stacked delay on the client while a backend is down/starting. | 1 ms floor; exponential up to `retry_max_ms` (MVP 2000). | Cross-box TTFB of a failing hop. **On path** only after failure. | `proxyJson`. | Keep retries explicit in the manifest (already are on MVP). Do not invent a second independent random on success. |
| **suggestion** | `DEFAULT_FAITH = 'medium'` (`minAccept: 0`) and `DEFAULT_FEAR = 'low'` (`refuseBelow: 0`). Session create uses those. Nexus never refuses a low-confidence route on faith/fear. Extra hops on a 2-CPU box are expensive. | Accept everything the allowlist already admitted. | Same-host extra `ensure`/peek. Cross-box extra TTFB. | After consult, before hop. | Session `/faith` `/fear` already exist; document that medium/low is “never refuse,” not a security default. |
| **suggestion** | `prepareInferenceBody` forces `enable_thinking: false` for nexus always, and for `general-text-speculator` only when the client omitted it. **Other aliases pass the body through.** Qwen3-class specialists default thinking **on** in llama-server. | Thinking off for chat unless the client opts in; on for other Qwen3 unless the client opts out. | Cross-box tokens (hidden CoT before first visible byte). Same-host tok/s. **On path.** | Inference body. | Force false unless `enable_thinking === true`. MVP Instruct 0.5B is not a thinker; do not fetch Qwen3-4B to “test” this. |
| **suggestion** | Council `parallel` omitted → parallel **if every variant is already ready** (then `canParallelCouncil`). `/council` with two cold aliases still serializes under `max_warm: 1`. | Auto-parallel when warm. | Same-host CPU if two llama-servers are ready. | `/council` only (opt-in slash/JSON). | Require `parallel: true` in the council spec; default serial. |
| **suggestion** | `SessionLedger` ctor `limit = 2048` if `session_limit` missing. `agents.windows.json` sets 2048; MVP 64. | 2048 in-process session rows. | Same-host Node heap. Not llama. | Session mint. | Require `gateway.session_limit`. Athlon 64. |
| **suggestion** | `buildLaunch` `--ctx-size` default **4096** if agent/profile omit it. KV default **`q8_0`** (that one is *less* RAM, not more). | 4096 ctx. | Same-host KV RAM. | Spawn. | Agent `context_size` (already set on llama agents). |
| **nit** | `vulkanAllThreadCount` uses `logical-2`, but invalid `logicalCpus` falls back to **8**. | 8 if the OS CPU count is garbage. Athlon real count is 2 → 1 thread. | Same-host CPU. | Only `profile.id === 'vulkan-all'` (not on MVP). | Pass `os.cpus().length`; fallback 1, not 8. |
| **nit** | `DEFAULT_MANIFEST` = `config/agents.cursor.json` (**not in tree**). `serve` without `--manifest` fails closed. | Fail closed. | — | CLI. | Default the CLI to `agents.windows-mvp.json` on this pack, or keep failing closed. |
| **nit** | `checkpoint_keep` default 3 when `checkpoint_dir` is set. Dir unset → off. | Off on MVP. | Disk. | Evict/stop. | `gateway.checkpoint_dir` already opt-in. |

## Not this class (already fail-closed or opt-in)

| Control | Today | Notes |
|---|---|---|
| Public bind | `127.0.0.1` default. `0.0.0.0`/`::` need `GREEN_ROOMZ_ALLOW_PUBLIC=1`. Child `--host 0.0.0.0` refused. | Do not “fix” security by binding wider. |
| `suspend_evicted` | Off unless `=== true` **and** not win32. | Windows terminates. Do not add NtSuspend. |
| Specialist `--no-warmup` | Unless `agent.warmup === true`. Resident nexus still warms. | Saves ~1 s ready; first real request pays graph build. |
| Thinking on chat | Off unless client sets it on `general-text-speculator`. Nexus always off. | Good. |
| `min_free_bytes` | 384 MiB refuse. | Last RAM brake after admission became advisory. |
| CORS `*` | Stripped. | — |

## Athlon hot-path (what actually stalls chat)

Not the 50 ms remainder (and not a 330 ms pad after the body). On this box, unslashed TTFB is:

1. PolicyGate acquire (`responsive` = 1).
2. Nexus consult, up to **25 s**, then maybe offline plan.
3. Cold `ensure` of `general-text-speculator` (mmap), `cold_start_timeout_ms` 180 s.
4. Optional HANDOFF peek up to **20 s**.
5. Generation at ~3 tok/s.
6. `finally` `release()`; `next_acquire` pad only if that mode is on (MVP `off`).

Wrong observer: enlarging an after-response sleep. Right knobs: nexus consult timeout, max_warm=1, no vulkan store winners, no silent RAM-admit of 4B/7B.

## Install keys (qodesh)

Already in `config/agents.windows-mvp.json`: `policy: responsive`, `max_warm_specialists: 1`, `idle_evict_ms: 120000`, `timing_privacy: off`, `host: 127.0.0.1`.

Still missing as required keys (code will invent a max if omitted on another manifest): `max_warm_specialists`, `idle_evict_ms`, `upstream_timeout_ms`, `nexus_consult_timeout_ms`. Do not add them by bouncing serve this pass.
