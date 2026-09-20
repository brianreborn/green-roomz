# Speed opt (2026-09-07, qodesh Athlon II)

Goal: faster local gateway + coding-agent loop without wrecking the usable default. No covert padding. `timing_privacy` stays `off`. Serve was not bounced.

## What changed

### 1. Coding-agent live loop (`src/dev-agent.mjs`, `bin/green-roomz.mjs`)

- After the first invalid / non-tool / premature-`done` model reply, stop calling the model and finish via the fallback planner. Still one gateway proof hit.
- CLI live `max_tokens` comes from install key `gateway.agent_max_tokens` (MVP **96**) unless `--max-tokens` is set. Was a silent 768 (~256s at 3 tok/s).
- SYSTEM prompt shortened. History clips write-content / stdout / stderr at 800 chars (was 4k).

**Save:** worst case 12×768 tokens (~50 min of Athlon generate) → 1×96 tokens (~32s) plus offline planner. Eval live was already `maxModelSteps` 1 / 96 tokens.

### 2. gatewayChat / eval timeouts (explicit install keys)

New required keys (not a silent 180s client abort):

| Key | MVP | windows.json | meaning |
|---|---|---|---|
| `gateway.agent_chat_timeout_ms` | 60000 | 180000 | coding-agent + eval fetch abort (answers in ~1 min, not 3–5) |
| `gateway.agent_max_tokens` | 96 | 768 | CLI live completion cap |

`--timeout-ms` / `--max-tokens` override. Eval honors `GRZ_CHAT_TIMEOUT_MS` else the install key.

`gateway.request_timeout_ms` / `upstream_timeout_ms` stay **180000** so Case D/G (~90s) and SSE (~81s) still fit.

**Save:** hung agent/eval slot 180s → **60s**. Eval live is one smoke case with a Promise.race deadline so a stuck llama generate cannot hold the client for 270s.

### 3. lock_alias / resident_fallback (no test-breaking pin)

Did **not** honor `model=` without `lock_alias` (llama.app last-alias; `test/gateway.test.mjs` still requires nexus code-switch from `model: general-text-speculator`).

Safe hot-path:

- On Instruct `peek_timeout`, keep/retry that hop (capped at `NEXUS_MAX_TOKENS`) instead of `resident_fallback` ramble on the router. Peek itself stays so HANDOFF tests still see specialist JSON.
- Cap `resident_fallback` `max_tokens` at existing `NEXUS_MAX_TOKENS` (96) if the client omitted or sent a larger cap. lock_alias to nexus is unchanged.
- Drop native/TTS aliases from `nexusCandidateAliases` (gateway already refuses to auto-hop them).
- `test/nexus.test.mjs` “visited blocks looping”: still asserts the code specialist is ensured once; after the loop the answer is capped `resident_fallback` 200, not 422.

**Save:** avoid ~107s nexus junk when Instruct peek timed out; resident_fallback 107s → ~32s if it still happens.

### 4. Lazy `probeRuntimes`

Default probe is skipProbe langs (node) + already-learned/extra. `{tool:"probe","ext":".py"}` probes one language. `resolveRuntime` skips spawn when the bin is not on PATH (no 5s powershell/gcc/rustc misses).

**Save:** ~1–10s when the probe tool runs (PowerShell cold start is the bulk).

## Measured / estimated

| Path | Before | After | Evidence |
|---|---|---|---|
| CLI live invalid JSON loop | up to 12×768 tok (~256s each) | 1×96 tok (~32s) + fallback | unit: `invalid model reply is one gateway hit then fallback` |
| Probe all langs | spawn powershell+compilers | skipProbe only | unit: `probe without ext does not spawn every language` |
| Instruct peek_timeout | abandoned → nexus ramble ~107s | keep/retry on Instruct, ≤96 tok | gateway branch; HANDOFF tests unchanged |
| resident_fallback generate | client default / large max_tokens | ≤96 tok | unit assert in gateway resident_fallback test |
| agent-std fetch abort | 180s | 60s (MVP `agent_chat_timeout_ms`) | `config/agents.windows-mvp.json` |

Did not re-run the live parity battery or bounce Windows GRZ serve. Unit tests cover the new branches.

## What we did not touch

- CUDA / GGUF downloads / 8600 GT.
- `idle_evict_ms` 120000, `max_warm_specialists` 1, `--parallel` 1.
- `request_timeout_ms` / `upstream_timeout_ms` / `cold_start_timeout_ms` 180s (usable long chat).
- Pinning `model=` without `lock_alias`.
- Nexus consult when more than one hop-eligible specialist exists (still required by `test/nexus.test.mjs`).
- Timing privacy / covert padding.
- Serve bounce; Linux cursor live serve.

## Remaining speed backlog

- Unslashed chat still pays nexus consult (MVP 10s) when code+text are both admittable.
- Cold mmap of Instruct after `idle_evict_ms` 120s.
- Single-slot CPU: a second eval still starves chat.
- 0.5B still cannot emit tool JSON; live coding quality is the fallback planner.
- Peek window vs 3 tok/s on non-fallback specialists (`qwenstral-code` still peeks).
