# Green-Roomz covert-channel review

Leak report only. No recipes, no PoCs, no encode/decode, no timing procedures.

Trees: `/workspace/green-roomz` and `/workspace/e2e-fresh/green-roomz`. Leak-surface `src/` is identical (`diff` empty). Citations are `/workspace/green-roomz`. e2e-fresh is the portable pack (`${GRZ_ROOT}`, `start.sh`); git tree has `test/` + docs + `agents.windows.json`.

Audience legend: **HTTP client** = anyone who can hit gateway `:8080` (loopback + optional API key). **Loopback process** = anything on the same host that can open `127.0.0.1:<agent.port>`. **Local disk** = readers of `data/` / configured dirs. **Co-resident agent** = another llama/whisper/piper/sd process on the same box.

---

## High

### CC-1 Stream path forwards llama `timings` (tok/s, prompt eval)
- file: `src/proxy.mjs:30`, `:80`, `:107-110`; callers `src/gateway.mjs:928-936`, `:1123-1129`
- leaks: top-level llama.cpp `timings` (`prompt_n` / `predicted_n` / eval ms / tok/s / cache-related fields when present) plus any non-hop-by-hop upstream headers
- to: HTTP client that set `stream: true` on direct-alias or text-fallback
- notes: non-stream JSON deletes `timings` (`sanitizeCompletionJson`). Nexus consult forces `stream: false` (`gateway.mjs:500`). Handoff peek SSE is stripped (`handoff.mjs:356`).

### CC-2 Completions keep ZW / homoglyphs / trailing space
- file: `src/util.mjs:129-141`; `src/proxy.mjs:27-56`
- leaks: model output may carry zero-width, homoglyphs, and trailing whitespace. `stripEscapes` only drops OSC/CSI and C0/C1 (keeps TAB/LF/CR). Compact `JSON.stringify` does not remove those code points.
- to: HTTP client of a sanitized llama completion
- notes: ANSI/C0 **are** stripped on the non-stream proxy path (`test/proxy.test.mjs:112-131`).

### CC-3 Image-generation body is an unsanitized PNG store
- file: `src/routing.mjs:237-238`; `src/gateway.mjs:244-247`, `:203-213`, `:523-566`; `policies/image-generation.md:1-6`
- leaks: `response_format: 'b64_json'` image bytes as `data:image/png;base64,...` in chat `content`. Policy does not constrain output bits. `completeNativeChat` does not call `sanitizeCompletionJson`. No durable image file; the HTTP body **is** the store.
- to: HTTP client of that turn (and any proxy/log that records the body)

### CC-4 TTS returns unsanitized WAV + source transcript
- file: `src/gateway.mjs:569-610`
- leaks: Piper writes `speech.wav` under `os.tmpdir()/grz-tts-*` (deleted in `finally`); response `choices[0].message.audio.data` is raw WAV b64; `transcript` echoes input text. Unpadded `content-length`.
- to: HTTP client; anyone who can read the temp file before `rm`

### CC-5 Mailbox/IPC recent dump on HTTP (cross-session)
- file: `src/gateway.mjs:359-365`, `:471-487`, `:1057-1066`; `src/mailbox.mjs:89-118`; `src/monitor/ipc.mjs:273-311`
- leaks: last ~64 hop envelopes (`seq`, `kind`, `source`, session ticket, `ts`, unpadded `payload`, `target`) plus occupancy. `/v1/monitor/recent` also dumps IPC recent/stats. Monitor-alias chat returns mailbox recent as `content` (no IPC recent on that path). No ticket/role filter.
- to: HTTP client (loopback-dev if no API key); any client that selects `security-monitor-agent`
- notes: live hop payloads are `{reason, hops}` (routing metadata), not user prompt text.

### CC-6 Hop timestamps and session tickets are cross-client
- file: `src/gateway.mjs:448-458`, `:1054-1058`; `src/mailbox.mjs:115`; `src/monitor/ipc.mjs:163`
- leaks: `ts: Date.now()`, session UUID, alias/`hops`/`reason` for **other** clients’ turns
- to: later `/v1/monitor/recent` or monitor-alias reader

### CC-7 `/metrics` publishes queue depth, PIDs, RAM
- file: `src/gateway.mjs:382-385`, `:431-445`; `src/hosts/windows.mjs:49-51`; `src/scheduler.mjs:17-43`
- leaks: `in_flight`, `queued`, session count, per-process alias/pid/state/`profileId`/resident, `totalMemoryBytes`/`freeMemoryBytes`/`loadAverage`
- to: HTTP client (`/metrics`; extra 401 only if an API key is set)
- notes: no tok/s and no child log buffers here.

### CC-8 Same-alias slot 0 — prompt KV residue across clients
- file: `config/agents.cursor.json:28-31` (`--parallel 1`); `src/process-manager.mjs:304-305`; `src/config.mjs:66-68`
- leaks: sequential requests to one alias occupy slot 0; prior prompt prefix can remain in that slot’s KV and change the next caller’s prompt-eval time
- to: the next gateway client (or loopback caller) of **that same alias**, not other aliases
- notes: each `llama_server` agent is its own process. **Negative for “4+4 agents share one llama-server.”**

### CC-9 Client `cache_prompt` (and other llama slot fields) forwarded
- file: `src/gateway.mjs:176-181`
- leaks: request body is spread into upstream; only `route_plan_only` / `lock_alias` / `session_id` are deleted. `cache_prompt` and other llama.cpp slot fields pass through.
- to: the llama-server for the routed alias (shared slot with other clients of that alias)

### CC-10 Unsanitized llama-server on loopback
- file: `config/agents.cursor.json:28-29`; `src/process-manager.mjs:158`, `:231`; `src/gateway.mjs:353-354`
- leaks: direct completions JSON including `timings`; `/slots/0` save/restore when `--slot-save-path` is on. Gateway does not proxy `/slots`. Launch args do not pass `--metrics` / `--log` / `--no-webui`.
- to: any process on the same host that can open `127.0.0.1:<agent.port>` (8181–8188 in cursor.json)

### CC-11 Co-resident processes share host LLC; no affinity isolation
- file: `src/process-manager.mjs:20-27`, `:275-277`, `:301-312`, `:426-447`; `src/hosts/windows.mjs:40-47`; `src/monitor/place.mjs:5-8`, `:32-38`, `:211-234`
- leaks: architectural — two or more llama-server processes on one machine share LLC. No `taskset`, `--cpumask`, or `sched_setaffinity`. `applyPriority` is `PRIORITY_BELOW_NORMAL` only. `place.mjs` is an in-memory 1+1 slice binder, not OS pinning.
- to: any other co-resident agent/process on the same box (including the other llama-server)
- notes: per-process `--parallel 1` means they do **not** share one llama-server slot table; they still share the host. Cursor/windows: typically **2** live llama-server (`max_warm_specialists: 1` + resident nexus). Android/note9: warm cap unset → up to **7**. Whisper + piper + stable-diffusion + logical monitor are the same host.

### CC-12 Council JSONL: per-alias `ms` + prompt/answers (opt-in)
- file: `src/gateway.mjs:299`, `:623-638`, `:659-674`, `:742-763`; `src/council.mjs:5`
- leaks: HTTP JSON and `x-green-roomz-council` carry per-alias wall-clock `ms`, status, winner/outlier/agreement. If `gateway.council_dir` / `GREEN_ROOMZ_COUNCIL_DIR` is set: `scores.jsonl` (ms); `disagreements.jsonl` unpadded `prompt` and `answers[].content` sliced to 2000 chars. `appendFileSync` with no `chmod`.
- to: HTTP client (council timings always); local disk readers when dir is set
- notes: shipped `agents*.json` do **not** set `council_dir` (disk channel dormant). HTTP `ms` is live.

### CC-13 Disk KV / idle-slot prompt cache (opt-in)
- file: `src/process-manager.mjs:136-137`, `:146-164`, `:343-350`, `:203-214`, `:231-234`, `:501-502`; `bin/green-roomz.mjs:274-286`
- leaks: if `checkpoint_dir` / `GREEN_ROOMZ_CHECKPOINT_DIR` is set: `--slot-save-path` + `--cache-idle-slots` persist slot KV as `.bin` plus `*.snapshot.json` (argv, model path, optional `prime.promptSha`). `prime` writes stock-prompt KV with `cache_prompt: true`.
- to: later process that restores the same alias; anyone who can read the checkpoint dir
- notes: shipped configs do **not** set `checkpoint_dir`. `checkpointPathFor` maps `[^a-z0-9-]` → `_` so distinct aliases can share a dir.

---

## Medium

### CC-14 Route identity headers on every inference
- file: `src/gateway.mjs:767-777` (applied e.g. `:511`, `:921-922`, `:1099-1100`)
- leaks: session id, requested/effective alias, route reason, hop chain, nexus alias, agency role
- to: HTTP client
- notes: `headerSafe` strips controls and caps 240; values are not padded or constant.

### CC-15 `/health` `/v1/models` `/props` inventory + uptime
- file: `src/gateway.mjs:356-381`, `:417-428`; `src/registry.mjs:72-99`
- leaks: `uptime_ms`, policy, agent ids, availability/loaded/cold, capability sets, mailbox/ipc occupancy counters
- to: HTTP client
- notes: no tok/s; `listModels` omits pid/`profileId`.

### CC-16 Proxied `usage` keeps prompt/completion token counts
- file: `src/proxy.mjs:27-56`
- leaks: `usage.prompt_tokens` / `completion_tokens` / `total_tokens` (size of prompt/completion)
- to: HTTP client on proxied completions
- notes: gateway-authored bodies zero usage (`gateway.mjs:225`, `:486`, `:606`, `:666`, `:854`, `:905`; `handoff.mjs:122`).

### CC-17 Chat-turn SSE: stripped timings, live cadence/size
- file: `src/handoff.mjs:321-323`, `:353-382`
- leaks: token-sized SSE payloads as upstream events arrive; `timings` stripped; `usage` on chunks kept. No padding of chunk size or inter-arrival.
- to: HTTP client

### CC-18 Error JSON + start-fail llama log tail
- file: `src/gateway.mjs:403-413`; `src/proxy.mjs:119`; `src/process-manager.mjs:9`, `:448-467`; `src/util.mjs:121-126`
- leaks: `error.details` as-is; 504 `timeout_ms`; 503 missing local paths; last ~2000 chars of child stdout/stderr (llama load/eval / tok/s lines if emitted). `redact()` only covers Bearer / data-URL / api_key.
- to: HTTP client that triggered the failed ensure; also `data/serve.log` via `console.error`

### CC-19 Unpadded mailbox payload length
- file: `src/mailbox.mjs:31-38`, `:108-132`; `src/monitor/ipc.mjs:146-171`; `src/util.mjs:148-155`
- leaks: payload JSON size. Top-level strings >256 chars hashed; nested object strings **not** hashed; arrays as-is. `SLOT_BYTES=16` `packSlot` unused by `CopyRing`. HTTP `content-length` is real dump size.
- to: whoever can `recent`/HTTP-dump (CC-5)

### CC-20 Process-global reject cache, no eviction
- file: `src/monitor/states.mjs:57`, `:151-178`; `src/monitor/ipc.mjs:483-502`
- leaks: first reject envelope per ticket (`from`/`to`/`reason`/`ts`) forever in `rejectsByTicket`
- to: in-process `peekReject`; also hot ring → `recent()` → HTTP (CC-5)

### CC-21 `serve.log` tees gateway stdout/stderr
- file: `src/serve-console.mjs:12-21`; `bin/green-roomz.mjs:117`
- leaks: listen lines, pre-warm failures, unhandledRejection stacks, start-fail llama tails. Observed files: startup + llama load errors, **not** live chat prompts.
- to: data-dir readers / operator TTY (`scripts/start-green-roomz.ps1:32` tails it)

### CC-22 Whisper audio in-memory; transcript not escape-stripped
- file: `src/gateway.mjs:239-242`, `:252-271`, `:544-555`; `policies/audio-transcription.md:5`
- leaks: inbound `data:audio/...;base64` POSTed as multipart to whisper. `.text` is `.trim()` only (no `stripEscapes`). Missing `.text` → whole JSON (alignment metadata) stringified into content.
- to: whisper-server process; HTTP client of the transcription
- notes: gateway does not persist the audio file.

### CC-23 Native/council/TTS wrappers skip `sanitizeCompletionJson`
- file: `src/gateway.mjs:555-559`, `:597-607`, `:633-635`, `:760-761`
- leaks: image/audio/embeddings/rerank wrappers and council `content` go through `jsonResponse` with no `stripEscapes`. Council keeps per-alias `ms`.
- to: HTTP client

### CC-24 Benchmark store writes tok/s to disk
- file: `src/benchmark.mjs:41-51`, `:85-89`, `:161-171`; example `data/benchmarks.json:33-36`
- leaks: `promptTps` / `generationTps` / `coldStartMs` per alias+profile (llama-bench, not live chat)
- to: readers of `data/benchmarks.json`; not served on gateway `/metrics`

---

## Low

### CC-25 Route-plan body exposes chosen slot and reason
- file: `src/gateway.mjs:849-855`, `:900-906`
- leaks: planned `route`, `reason_code`/`confidence`, plus route headers (CC-14). Usage zeros.
- to: HTTP client

### CC-26 Drain broadcasts to every in-process listener
- file: `src/mailbox.mjs:17-19`, `:81-86`, `:135-147`; `src/monitor/ipc.mjs:265-270`, `:435-444`
- leaks: every drained slot body to all `onEvent` callbacks
- to: extra in-process monitors on the same `Mailbox`/`MonitorIpc`
- notes: default dump showed `listeners: 0`.

### CC-27 Hash-chained logger (in-memory; file opt-in)
- file: `src/monitor/logger.mjs:22-23`, `:68-85`, `:102-180`; `src/gateway.mjs:297`, `:461-467`
- leaks: hop envelopes (objects unpadded; fat top-level strings hashed). `createLogger()` has **no path** (write no-op) but still grows an in-memory chain. `read()` is role-gated `admin`/`respond`. Gateway HTTP does not expose `logger.read()`.
- to: in-process `read()`; local file readers only if `path` is set

---

## Negatives (checked, not leaking as asked)

- Non-stream buffered completions **delete** `timings` (`src/proxy.mjs:27-30`, `:80-101`; `test/proxy.test.mjs:65-87`).
- Gateway never **authors** `Server-Timing`, `tokens_per_second`, `prompt_ms`, `predicted_ms`, or `cache_prompt` headers. `Retry-After` on 503/504 is constant `"2"` (`gateway.mjs:404-405`).
- No `SharedArrayBuffer` / mmap / shm / unix-socket / named-pipe mailbox. Rings are in-process JS arrays; drain clears slots.
- Live gateway IPC frames carry route metadata, not user prompt/completion text.
- `MonitorIpc.wait()` is non-blocking and not on `GATEWAY_IPC_RIGHTS`.
- Security-monitor is `runtime: logical`, not a llama slot.
- Shipped manifests do **not** set `checkpoint_dir` or `council_dir`.
- `autotune.mjs` is GGUF metadata only; `compile-prompt.mjs` / `kernel-text.mjs` / `constants.mjs` have no cache/tok/s API fields.
- Cross-agent occupancy of **one** llama-server: **not present**. Isolation failure is host LLC (CC-11) and same-alias slot 0 (CC-8).

---

## Layout (for the “4+4 / shared L3” question)

| manifest | live llama-server (typical) | threads | warm cap |
|---|---|---|---|
| `config/agents.cursor.json` (both trees) | resident `tool-router-agent` + 1 specialist | cpu-4 `--threads 4` | `max_warm_specialists: 1` → **2** |
| `config/agents.windows.json` (git tree only) | same cap | nexus cpu-2 `--threads 2`; vision/code/text vulkan threads 4–6 | **1** → **2** |
| `config/agents.android.json` / `agents.note9.json` | resident + specialists | android nexus 2 / spec 4; note9 all 4 | unset → up to **7** |

One gateway process; `process-manager` spawns per-alias children. Runtimes on the same host, no CPU mask: `llama_server` + `whisper` + `piper` + `stable_diffusion` + logical monitor.
