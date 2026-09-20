# Lessons learned (qodesh Windows MVP)

Living list. Add a row when a failure mode costs real time. Do not restate the design doc — state the **mistake**, the **cost**, and the **rule**.

Host: Athlon II X2, 16 GB, CPU llama only. Never GGUF on the 8600 GT.

## Product / routing

| # | Mistake | Cost | Rule |
|---|---|---|---|
| L1 | Treat `GET /health` `degraded` as the honest badge whenever **any** of 11 aliases lack a file | Dogfood always looked broken; `/draw` 503 was correct, the badge was not | Health watches `gateway.health_aliases` (nexus + Instruct). Missing vision/TTS stay **503**. `degraded` means a **required** alias is unavailable |
| L2 | Generic OpenAI clients send `model=` without `lock_alias`. llama.app last-alias made us **ignore** `model=` | Unslashed hello → nexus JSON router, **107s** of checklist garbage | `chat_default`: generic ids (`general-text-speculator`, `gpt-4o`, omitted) skip nexus **and** HANDOFF peek when the plan is plain chat. llama.app after `/code` still consults |
| L3 | Agency on 0.5B as “a better completion” | `/code` 7B impractical; tiny Instruct cannot emit tool JSON | Agency is **tools + compiler/runtime errors**. `green-roomz agent --offline` fallback planner. Live model gets one junk JSON then fallback |
| L4 | Keep Instruct cold (`specialists stay cold`) for RAM | First client turn **>60s** (mmap + graph). Abort then next POST **500** (`--parallel 1` still generating) | Pin + pre-warm Instruct at serve. **1-token prime** so graph exists. Do not abort a first generate and immediately send another |
| L5 | HANDOFF peek on Instruct, then `peek_timeout` → `resident_fallback` on the router | Extra 8–20s TTFB; then router ramble | Chat path does not peek. Peek-timeout on Instruct **keep/retry** capped at `NEXUS_MAX_TOKENS` |

## Defaults / security theater

| # | Mistake | Cost | Rule |
|---|---|---|---|
| L6 | Missing install key quietly picks max security / max RAM / max thoroughness | 50 ms pad, 25 s nexus consult, unlimited warm set | **Required** keys. Default must be **usable**. Operator sets the tradeoff at install. See `silent-defaults.md` |
| L7 | Timing privacy: remainder **plus** jitter **plus** `wait===0 then wait=q` | Stacked delay on the hot path; 50 ms was not a useful default | One remainder bucket `[0,q)` **before first client byte**. MVP `timing_privacy: off` |
| L8 | Covert-channel padding applied off the observer path | Slow same-host with no cross-box TTFB gain | Pad only where an observer actually sits. Same-host multi-proc is not why the concern was raised |

## Tests / iteration

| # | Mistake | Cost | Rule |
|---|---|---|---|
| L9 | 16 live E2E cases against `:8080`, 768 `max_tokens`, 180 s fetch | E8/E9 **270s** each; leftover generate queued the next case | Smoke + **fail-fast** + offline default (`npm run iterate`). Live is **one** case, **60s** client deadline. `npm run eval:e2e:full` is opt-in |
| L10 | Halt the inner loop because health is `degraded` | Would freeze iteration on a box that is supposed to lack SD/whisper | Halt on **DOWN** (nothing listening) or first **protocol/smoke FAIL**. Quality misses (Ada, IFEval) do not halt unless `GRZ_EVAL_STRICT=1` |
| L11 | `node --test` the whole tree including fuzz while dogfooding chat | Starves the single Athlon slot; chat 180s timeout | Inner loop: `test/dev-agent`, config, routing, gateway, e2e smoke. Do not run a battery while chatting |
| L12 | Probe every language on `probe` (PowerShell + gcc/rustc ENOENT timeouts) | 1.5s+ in unit tests; worse cold | Lazy probe. skipProbe for node. `{tool:probe,ext:.py}` is one language |

## Ops / git

| # | Mistake | Cost | Rule |
|---|---|---|---|
| L13 | Leave a morning serve running while landing routing/health | Live probes tested **stale** code; 60s aborts looked like product bugs | Bounce Windows `:8080` when the tree must be the process. Reap by **PID** (`stop.cmd`), never by image name. Do not stop Linux cursor live serve |
| L14 | R&D worker exits after the first green Ada test | Streamed SSE still dropped assistant text; windows.json keys missing | Workers **keep iterating** the named backlog unless a true blocker (CUDA/download, rebase in progress, would kill Linux serve, unfixable red test) |
| L15 | Call the default branch `master` | This repo’s default is **`main`**. Live host line is **`host/qodesh`** | Push product to `main` and `host/qodesh`. No GGUF, no `runtime/` |
| L16 | Continual merge feared because it might lose history | Blocked landing | Merge. Git can check out old SHAs. Do not rewrite landed `origin/main` to clean a conflict-message nit |

## 6GL / shape of the code

| # | Mistake | Cost | Rule |
|---|---|---|---|
| L17 | Hardcode 768 tokens / 180 s / 25 s consult in the agent loop | 12 steps × 768 tok × ~3 tok/s ≈ **50 min** of Athlon generate on junk JSON | Declare in the manifest (`agent_max_tokens`, `agent_chat_timeout_ms`, `nexus_consult_timeout_ms`). Compile/validate. Tiny tests. That is the 6GL seam here: **JSON + policies + stock prompts**, not a bigger model |
| L18 | Stock-prompt “memory-feedback-loop” as if it were a store | Model reads prose; nothing persisted; Ada dropped on turn 2 | Prompt frames ≠ memory. Need `SessionLedger` working set + inject + header. Prompt can **describe** the loop; code must **run** it. Continuation: SSE capture + `data/sessions/<uuid>.jsonl` |
| L19 | `max_tokens` 16 on a 0.5B that wraps in `Reason`/`Summary` | Client sees a heading, not a sentence | Cap for speed, but the quality bar is the model. Do not fake ChatGPT wording |
| L20 | `chat_default` streamed via `proxyJson` without returning assistant text | Session memory stored the user turn only; `chat-mvp.cmd` (SSE) dropped Ada | `proxyJson` must return `{ status, content }` for JSON **and** SSE; gateway `recordProxy` writes it. A stream:true client is the dogfood path |
| L21 | Naive wall-clock timeout on streaming (`retry_deadline_ms` capping `writeSanitizedSse`) + `idempotencyKey` gate on 503 | Active generation aborted mid-sentence at 180s on CPU (~3 tok/s); standard clients without `idempotency-key` failed 503 on warmup | Decouple connect retry budget from stream duration. Streaming uses an **inactivity stall watchdog** and socket reset/client abort detection, not a wall-clock guillotine. 503 retries on startup require no special header |

## How to add a lesson

One row: **mistake / cost / rule**. If it already exists, add a measured cost (ms, tok, which case). R&D workers append here when they burn a slot on a known class of error. Standing R&D (memory, speed) must update this file when a new class shows up — not only the specialist review note.
