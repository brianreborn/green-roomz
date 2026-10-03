# Covert Channel Reviewer — first pass (information leaks only)

**Scope:** Green-Roomz side-channels / steganography as *leaks*, not attack recipes.  
**Trees:** code already on box; nothing cloned.

## Tree map

| Path | Role |
|------|------|
| `/workspace/session/green-roomz` | Full product: `src/`, `config/`, `policies/`, `bin/`, `test/`, `data/` (bench/smoke artifacts), docs. Canonical runtime surface for this pass. |
| `/workspace/grz-src` | Slim extract of later gateway hardening only: `gateway.mjs`, `handoff.mjs`, `nexus.mjs`, `routing.mjs`, `util.mjs`. Adds `stripControls` / `headerSafe` / handoff `safeReason`/`safeSuggest`. **Does not** include `proxy.mjs`, process-manager, benchmark, hosts. |
| `/workspace/reviews` | Prior review buckets (`covert/` empty before this file). |

Primary line refs below are **session tree** unless marked `grz-src`.

---

## Findings

### 1. llama tok/s and latency

| ID | path:line | what leaks | to whom |
|----|-----------|------------|---------|
| T1 | `src/proxy.mjs:23-26` | `sanitizeCompletionJson` deletes `timings` only; leaves `usage` (incl. `prompt_tokens_details.cached_tokens`) and other llama fields | HTTP client (non-stream JSON) |
| T2 | `src/proxy.mjs:68-84` | `stream:true` / non-text upstream: body piped raw — no timings strip | HTTP client (SSE/stream) |
| T3 | `src/handoff.mjs:311-328` | After peek, remaining SSE written raw (`response.write(value)` / `parser.carry`) — unsanitized chunks can carry `timings` | HTTP client (stream deliver) |
| T4 | `src/handoff.mjs:313-314` vs `328` | First peek events sanitized; tail not — split sanitization | HTTP client |
| T5 | Observed request wall-clock (chat turn / hop loop `gateway.mjs:338-397`) | End-to-end latency encodes load, cache warm/cold, hop count | HTTP client |
| T6 | `src/process-manager.mjs:229-247` | Ring buffer of child stdout/stderr (64KiB); start failures append last 2k of logs (llama `slot print_timing` / tok/s seen in `data/gate-b-llama-server.err.log`) into `UnavailableError` message | HTTP client (error body); local process memory |
| T7 | `data/smoke-text-resp.json`, `data/gate-b-completion.json`, `data/*bench*.log` | Persisted llama `timings` / tok/s / `cached_tokens` | Local filesystem / operator / any local process with read |

### 2. Shared L3 / cache-line timing between agents

| ID | path:line | what leaks | to whom |
|----|-----------|------------|---------|
| C1 | `src/process-manager.mjs:10-17` | Design: GPU specialist uses `logical-2` threads; resident nexus reserved `--threads 2` — intentional co-residency on same host CPU/L3 | Contention observable as latency by HTTP client; cross-agent via shared silicon |
| C2 | `src/gateway.mjs:196-210` + `hosts/windows.mjs:49-50` | `/metrics` returns `loadAverage`, `freeMemoryBytes`, `totalMemoryBytes` | HTTP client (loopback w/o API key → identity `loopback-dev`; with API key → authenticated only) |
| C3 | No explicit cache-probe API in JS | No coded L3 probe; leak is architectural contention + metrics/latency only | — |

### 3. Mailbox / IPC length and timing

| ID | path:line | what leaks | to whom |
|----|-----------|------------|---------|
| M1 | `src/gateway.mjs:196-201` | `queued`, `in_flight`, `sessions` counts | HTTP client via `/metrics` |
| M2 | `src/scheduler.mjs:7-39` | Policy queue length/timing of `acquire` under load | Observable via M1 + request latency to HTTP client |
| M3 | `src/constants.mjs:26` + `handoff.mjs:201` | `HANDOFF_PEEK_CHARS=48` — early abort on HANDOFF vs continue; hop duration differs | HTTP client (latency); local hop abort |
| M4 | `src/gateway.mjs:321-389` + `nexus.mjs:37-45` | `notes[]` (handoff reasons / suggest text) concatenated into nexus prompt `Previous HANDOFF:` — length & content mailbox across specialists → nexus | Another agent (nexus / tool-router) |
| M5 | `src/gateway.mjs:213-221`, `:395-397` | Response headers `x-green-roomz-hops`, `-effective-alias`, `-route-reason`, `-requested-alias`, `x-session-id` | HTTP client |
| M6 | Session tree `gateway.mjs:215-219` (vs grz-src `headerSafe`) | Route header values not control-stripped in session tree | HTTP client (header channel) |
| M7 | `src/sessions.mjs:11-17` | Session stores `modality`, `agentAlias`, identity; count exposed via metrics | Local process memory; count → HTTP client |

### 4. KV / prompt-cache residue

| ID | path:line | what leaks | to whom |
|----|-----------|------------|---------|
| K1 | `src/proxy.mjs:23-47` | Does **not** strip `usage.prompt_tokens_details.cached_tokens` / `usage.*` | HTTP client |
| K2 | Evidence shape: `data/smoke-text-resp.json` (`cached_tokens`, timings `cache_n`) | Upstream llama exposes cache hit counters; gateway keeps usage | HTTP client / disk |
| K3 | `config/agents.windows.json` profiles `--cache-type-k/v q8_0`, `--parallel 1` | KV quantization / single parallel slot — residue stays in llama process address space across turns on same port/alias | Local process (llama-server); cross-request via same agent process |
| K4 | `autotune.mjs:140+` `nKv` | GGUF metadata key-count only (model file parse) — **not** runtime prompt KV residue | Local tooling only |

### 5. Log / prompt-cache files

| ID | path:line | what leaks | to whom |
|----|-----------|------------|---------|
| L1 | `src/process-manager.mjs:8,222-231` | In-memory child logs (may include prompts if runtime logs them) | Local process; subset → HTTP via T6 |
| L2 | `data/*.stdout.log`, `*.err.log`, `*completion*.json`, `smoke-*-resp.json` | Bench/smoke artifacts with timings, completions, sometimes prompts | Local filesystem |
| L3 | `.gitignore` ignores some `data/*.log` / `*.req.json` / `*.res.json` but many JSON/logs remain tracked in tree | Residual artifacts still present on disk in this checkout | Local operator / other agents on box |
| L4 | `src/benchmark.mjs:88` writes `data/benchmarks.json` | promptTps / generationTps / coldStartMs | Local filesystem |

### 6. Image-gen and audio as covert storage

| ID | path:line | what leaks | to whom |
|----|-----------|------------|---------|
| I1 | `config/agents.windows.json:176-196` + `process-manager.mjs` piper/sd paths | Agents declared; persistent image/audio servers **not** provisioned (`piper` throws Unavailable) | N/A runtime storage yet |
| I2 | `policies/image-generation.md`, `policies/audio-transcription.md` | No constraint on stego in pixels/waveform; output is free-form model bytes when live | Future HTTP client receiving media |
| I3 | `src/routing.mjs` modality detect + `util.mjs:75` redact of `data:image|audio;base64` in `redact()` only | Base64 media in **error/redact paths** scrubbed; inference path still forwards multimodal parts upstream | Upstream local agent; redact consumers only |
| I4 | Gateway passes completion `content` through unchanged | If/when image/audio bytes appear in JSON/SSE, no stego scrub | HTTP client |

### 7. Model-output encoding (whitespace / unicode / JSON)

| ID | path:line | what leaks | to whom |
|----|-----------|------------|---------|
| O1 | `src/handoff.mjs` / `deliverPeek` / `proxy.mjs` | Assistant `content` not normalized (ZWSP/unicode/whitespace preserved) | HTTP client |
| O2 | Session `nexus.mjs:42` + `gateway.mjs:388` | Handoff `reason`/`suggest` fed to nexus **without** stripControls (grz-src hardens) | Another agent (nexus) |
| O3 | Session `handoff.mjs:6-30` | `parseHandoffContent` accepts raw reason/suggest; no C0 strip (grz-src `safeReason`/`safeSuggest`) | Local hop state → nexus notes |
| O4 | `gateway.mjs:280` / route-plan responses | Plan/object JSON stringified into assistant content | HTTP client |
| O5 | `grz-src/util.mjs:81-86` | `stripControls`/`headerSafe` exist only in extract — session tree gateway headers unsanitized | Diff: session weaker |
| O6 | `util.mjs:49-52` `secureEquals` | Length mismatch short-circuits before `timingSafeEqual` — API-key length oracle | HTTP client / local auth observer |

### Related (routing / ops telemetry)

| ID | path:line | what leaks | to whom |
|----|-----------|------------|---------|
| R1 | `registry.mjs:49-64` via `/health`,`/v1/models`,`/props` | Availability, `unavailable_reasons` (filesystem paths to missing models/runtimes), resident flags | HTTP client (any authenticated/loopback-dev identity) |
| R2 | `gateway.mjs:162-163` | `/metrics` gated only when `apiKey` set; else open on loopback | Local HTTP clients |
| R3 | `gateway.mjs:174-178` | Error `details` (e.g. missing artifact paths) returned to client | HTTP client |

---

## High-priority second pass

1. **`src/proxy.mjs`** — stream bypass; decide whether `usage`/`cached_tokens`/`system_fingerprint` are intentional leaks; unify sanitize for all paths.  
2. **`src/handoff.mjs` `deliverPeek`** — raw SSE tail after peek (lines ~311–328); carry buffer rewrite.  
3. **`src/gateway.mjs` headers + `/metrics` + `/health`** — hop/reason header channel; metrics resource/queue exposure under loopback-dev.  
4. **`src/process-manager.mjs` logs → error messages** — llama timing/prompt residue to clients.  
5. **Session vs `grz-src` handoff/nexus sanitizers** — merge `stripControls`/`safeReason` into session or document session as weaker.  
6. **Co-resident nexus + specialist** — document/measure latency coupling as unavoidable shared-host channel; metrics `loadAverage` amplification.  
7. **Image/audio runtimes** (when provisioned) — output scrub / metadata policy; not reviewable in code today beyond stubs.  
8. **`data/` artifacts** — treat as sensitive residual; retention policy.

---

## Explicit non-findings (this pass)

- No intentional stego encode/decode helpers in source.  
- No shared-memory IPC primitive beyond HTTP-to-localhost agent ports + in-process queues/maps.  
- `autotune` “KV” is GGUF file metadata, not prompt cache.

*End first pass. Leak descriptions only — no exploit procedures.*
