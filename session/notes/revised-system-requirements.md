# Local Multimodal Agent Gateway — Revised System Requirements

**Status:** Implementation-ready draft  
**Target runtime:** `llama.cpp`-compatible local inference processes  
**Normative language:** **MUST**, **MUST NOT**, **SHOULD**, and **MAY** are requirement levels.

## 1. Purpose and operating model

The system SHALL expose a stable, OpenAI-compatible gateway for four functional agent aliases while operating within a single-GPU, VRAM-constrained host. Clients SHALL address functional aliases rather than model filenames or backend ports.

The gateway SHALL own routing, media inspection, backend lifecycle, admission control, session affinity, authentication, and capability reporting. Backend inference processes SHALL bind only to a loopback interface and SHALL NOT be directly exposed to untrusted networks.

The default deployment model is intentionally serial: at most one inference backend may own the configured GPU at a time. Requests for another backend SHALL enter a bounded queue until the active backend is released and the requested backend is healthy.

## 2. Immutable functional agent registry

### 2.1 Registry behavior

The runtime SHALL load a versioned, read-only agent manifest at startup. Each manifest release SHALL have:

- a schema version;
- a manifest version;
- a SHA-256 digest of the canonical manifest;
- one unique entry for each required functional alias;
- absolute or deployment-root-relative artifact paths;
- SHA-256 digests for every model and projector artifact;
- a declared runtime compatibility range;
- native capabilities and gateway-accepted capabilities recorded separately.

The manifest SHALL NOT be modified while the service is running. A change SHALL require validation followed by a controlled service restart. Secrets SHALL NOT be stored in the manifest.

Startup SHALL fail closed if an alias is missing, a digest does not match, a referenced file is absent, two aliases conflict, or the installed runtime is outside the declared compatibility range.

### 2.2 Required aliases

#### `vision-layout-agent`

- **Core task:** document-image extraction, OCR, table recovery, and structural layout analysis.
- **Target model:** `qwen2-vl-7b-instruct-q4_k_m.gguf`.
- **Target projector:** matching `qwen2-vl-7b-mmproj-f16.bin`.
- **Context size:** `8192`.
- **Native capabilities:** text and image, but only after artifact/runtime preflight confirms support.
- **Gateway-accepted capabilities:** text, image, and supported file containers that the gateway can safely decode into images.
- **Speculation:** n-gram speculation with:
  - `--spec-type ngram-mod`
  - `--spec-ngram-mod-n-match 24`
  - `--spec-ngram-mod-n-min 48`, unless benchmarks justify a different manifest value
  - `--spec-ngram-mod-n-max 64`, unless benchmarks justify a different manifest value
- **Prohibited configuration:** `--spec-draft-n-max` SHALL NOT be used to configure `ngram-mod`.

#### `audio-transcription-agent`

- **Core task:** audio ingestion and speech transcription.
- **Target model:** `qwen2-audio-7b-instruct-q4_k_m.gguf`.
- **Target projector:** matching `qwen2-audio-7b-mmproj-f16.bin` or other runtime-required audio adapter.
- **Context size:** `8192`.
- **Native capabilities:** text and audio, but only after artifact/runtime preflight confirms support.
- **Gateway-accepted capabilities:** text, audio, and supported file containers that the gateway can safely decode into audio.
- **Speculation:** n-gram speculation with:
  - `--spec-type ngram-mod`
  - `--spec-ngram-mod-n-match 12`
  - `--spec-ngram-mod-n-min 24`, unless benchmarks justify a different manifest value
  - `--spec-ngram-mod-n-max 48`, unless benchmarks justify a different manifest value
- **Prohibited configuration:** `--spec-draft-n-max` SHALL NOT be used to configure `ngram-mod`.

#### `qwenstral-code-speculator`

- **Core task:** source-code generation and transformation, schema-constrained JSON, and structural text evaluation.
- **Target model:** `qwen2.5-coder-7b-instruct-q4_k_m.gguf`.
- **Preferred draft model:** `qwen2.5-coder-1.5b-instruct-q4_k_m.gguf`.
- **Context size:** `4048` unless corrected to another explicitly benchmarked manifest value.
- **Native capabilities:** text only.
- **Gateway-accepted capabilities:** text and text-decodable files only.
- **Projectors:** prohibited.
- **Speculation:** draft-model speculative decoding MAY be enabled only after the compatibility checks in Section 3 pass. Normal target-only decoding SHALL be the automatic fallback.

#### `mistral-text-speculator`

- **Core task:** narrative reasoning, natural-language writing, contextual verification, and logical schema extraction.
- **Target model:** `mistral-7b-instruct-v0.3.Q4_K_M.gguf`.
- **Candidate draft model:** `Qwenstral-Small-3.1-0.5B.Q4_K_M.gguf` with documented vocabulary transplantation.
- **Context size:** `16384`.
- **Native capabilities:** text only.
- **Gateway-accepted capabilities:** text and text-decodable files only.
- **Projectors:** prohibited.
- **Speculation:** the candidate draft model SHALL be treated as experimental and disabled by default. It MAY be enabled per manifest only after the compatibility and output-equivalence gates in Section 3 pass. Normal target-only decoding SHALL remain available.

## 3. Artifact and speculative-decoding preflight

Before an agent becomes routable, the manager SHALL validate:

1. The model and projector files exist and match their manifest SHA-256 digests.
2. The installed runtime recognizes the model architecture and required media adapter.
3. A projector or adapter belongs to the selected model family and can complete a minimal media inference.
4. A draft model and target model have compatible token ID semantics, vocabulary size, special tokens, tokenization behavior, and runtime architecture support.
5. Both target-only and speculative modes pass a fixed smoke-test corpus without crashes or malformed output.
6. Speculative output under greedy decoding matches target-only decoding for the equivalence corpus.
7. The measured draft-token acceptance rate and end-to-end latency show a configured minimum benefit. If they do not, speculation SHALL be disabled for that agent.

A failed speculative preflight SHALL disable speculation, not the target model, unless target-only inference also fails. A failed multimodal preflight SHALL remove the unverified native media capability and mark the agent unavailable for that media type.

## 4. Global execution and hardware policy

### 4.1 CPU and process priority

Every inference process SHALL start with:

- `--threads 3`;
- `--threads-batch 4`;
- low OS scheduling priority: `BELOW_NORMAL_PRIORITY_CLASS` on Windows or an equivalent priority such as `nice -n 10` on Unix-like systems.

These are default host-policy values and SHALL be manifest-configurable because optimal values vary by CPU and runtime build. A compliance test SHALL verify the effective values reported by the backend.

### 4.2 GPU selection and Vulkan

The runtime installation SHALL be compiled with Vulkan support. Merely setting an environment variable SHALL NOT count as proof of Vulkan acceleration.

Each child process SHALL receive:

- `GGML_VULKAN=1` when supported by the selected runtime build;
- an explicit `--device` value obtained from runtime device enumeration;
- `--split-mode none`;
- an explicit `--main-gpu` value where the runtime supports it.

`VK_LOADER_DEBUG=all` SHALL be disabled in normal operation. It MAY be enabled through a diagnostic setting and its logs SHALL be bounded and rotated.

Startup SHALL verify from runtime-reported device and tensor-placement data that Vulkan is active. If acceleration was required but is not active, the backend SHALL fail readiness rather than silently fall back to CPU.

### 4.3 VRAM policy

The default offload ceiling SHALL be `--n-gpu-layers 12`, but it SHALL NOT be treated as a complete VRAM guarantee. The manifest SHALL also specify:

- context size;
- batch and micro-batch sizes;
- server parallel-slot count, defaulting to one;
- KV-cache types;
- projector/media reserve;
- minimum free-VRAM reserve;
- maximum observed startup allocation from the qualification benchmark.

Before accepting traffic, the manager SHALL compare available VRAM with the qualified peak plus the configured reserve. If the budget is not met, it SHALL reject startup or use a separately qualified lower-memory profile. It SHALL NOT improvise an untested configuration.

## 5. Backend ownership and VRAM lifecycle

### 5.1 Single-owner state machine

The manager SHALL implement the following explicit states:

`IDLE → STOPPING → RELEASING → STARTING → WARMING → READY → DRAINING`

Only `READY` may receive inference traffic. State transitions SHALL be guarded by a process-wide asynchronous mutex. All state changes SHALL be recorded with timestamps and correlation IDs.

### 5.2 Process ownership and termination

The manager SHALL retain, for each launched backend:

- PID and process-group or Windows Job Object identity;
- process creation timestamp;
- executable path and command fingerprint;
- selected agent alias;
- assigned backend port;
- captured stdout/stderr handles.

The manager SHALL terminate only processes it can prove it owns. It MUST NOT enumerate and kill arbitrary processes by executable name, port, model filename, or ancestry alone.

Shutdown SHALL proceed as follows:

1. stop admitting new work;
2. allow an in-flight request to finish or reach its configured drain deadline;
3. request graceful termination;
4. wait for a bounded grace period;
5. terminate the owned process group or Job Object if still alive;
6. verify the process exited, the backend port closed, and the device allocation returned below the configured threshold.

### 5.3 Readiness instead of fixed sleeps

The system SHALL NOT use an unconditional 8–10 second sleep as evidence of readiness. After process creation, it SHALL poll the backend health endpoint with jittered bounded intervals. A backend becomes ready only when:

- its process remains alive;
- the expected model identity is reported;
- health returns success;
- the required native capability is present;
- optional warm-up inference succeeds.

The default cold-start deadline SHALL be configurable. On expiry, the manager SHALL stop the owned process, record a structured failure, and return a gateway `503` response with `Retry-After` where appropriate.

## 6. Queueing, concurrency, and cancellation

Only one backend swap or GPU-owning inference operation SHALL occur at a time. The gateway SHALL implement:

- a bounded FIFO queue with configurable capacity;
- per-request queue and execution deadlines;
- cancellation when the client disconnects;
- duplicate-request protection using an idempotency key where supported;
- queue-depth, wait-time, cold-start, and execution-time metrics;
- rejection with `429` when the queue is full;
- `503` when the requested agent cannot become ready.

The lock SHALL cover state transition and GPU ownership. Non-GPU work such as authentication, request validation, safe file decoding, and response serialization SHOULD remain concurrent.

## 7. Gateway network and security requirements

### 7.1 Binding and trust boundaries

- The public gateway MAY listen on configurable port `8080`.
- The active backend SHALL listen only on `127.0.0.1` or an equivalently isolated interface, using configurable port `8081`.
- Public deployments SHALL use TLS at the gateway or an authenticated reverse proxy.
- The gateway SHALL require an API key or an equivalent authenticated identity unless explicitly configured for loopback-only development.
- API keys and secrets SHALL come from a secret store or protected environment, never the agent manifest.

### 7.2 Input controls

The gateway SHALL enforce:

- request-body and decoded-media size limits;
- MIME allow-lists verified from content, not filename alone;
- image dimension and pixel-count limits;
- audio duration, channel-count, and sample-rate limits;
- decompression-bomb defenses;
- filename/path sanitization and no client-controlled filesystem paths;
- temporary-file isolation with guaranteed cleanup;
- configurable rate limits per authenticated identity;
- strict CORS allow-lists for browser clients;
- redaction of authorization data and media payloads from logs.

## 8. API routing and capability representation

### 8.1 Route order

Explicit gateway routes SHALL be registered before any wildcard proxy route. At minimum these include:

- `/health` and `/v1/health`;
- `/v1/models`;
- `/props` where compatibility requires it;
- `/metrics`, protected from public access by default;
- `/v1/chat/completions`;
- upload/session initialization routes implemented by the gateway.

The catch-all `/{path:path}` proxy MAY support required methods, but SHALL use an explicit allow-list. Unsupported methods SHALL return `405`; unknown or prohibited paths SHALL return `404` rather than being blindly forwarded.

### 8.2 Truthful capabilities

The gateway SHALL NOT falsely report that every backend natively supports vision and audio.

Each model record SHALL distinguish:

- `native_capabilities`: capabilities verified on that backend;
- `gateway_accepted_capabilities`: inputs the gateway can accept and route or transform;
- `routing_behavior`: whether a media input can override the requested functional alias;
- `availability`: ready, cold, unavailable, or degraded;
- `experimental_features`: including unqualified or opt-in speculative decoding.

If a third-party client requires a legacy boolean such as `vision: true`, that compatibility field MAY describe the gateway facade only, provided the response also exposes the accurate native fields and the gateway can actually complete the advertised request through routing. The gateway SHALL never advertise an end-to-end capability it cannot fulfill.

### 8.3 Payload inspection

For `/v1/chat/completions`, the gateway SHALL parse JSON structurally rather than scanning raw bytes. It SHALL recognize, subject to schema validation:

- `image_url` and supported image content parts;
- `data:image/...` URLs;
- `input_audio` and supported audio content parts;
- `data:audio/...` URLs;
- gateway-issued upload references.

Routing precedence SHALL be deterministic:

1. A request containing both image and audio SHALL be rejected with `400` unless an explicitly qualified workflow supports both.
2. Audio input SHALL route to `audio-transcription-agent`.
3. Image input SHALL route to `vision-layout-agent`.
4. Text-only input SHALL use the requested functional alias.
5. An unknown alias SHALL return `400` with the allowed aliases.

The gateway MAY rewrite the backend model field, but audit metadata SHALL preserve both the client-requested alias and the effective routed alias. Client-supplied URLs SHALL be subject to SSRF defenses, scheme allow-lists, redirect limits, DNS/IP validation, download limits, and timeouts.

## 9. Session affinity ledger

The gateway SHALL maintain a bounded, concurrency-safe session ledger. The preferred key is a gateway-issued opaque session ID. A validated `conv_id` MAY be accepted as a compatibility key.

Each ledger entry SHALL contain:

- effective functional alias;
- verified media modality;
- creation and last-access timestamps;
- expiry time;
- owning authenticated identity;
- optional backend conversation metadata that contains no raw secrets.

Entries SHALL have a configurable TTL, maximum count, per-identity limit, and deterministic eviction policy. A session created by one identity SHALL not be accessible by another.

GET request bodies SHALL NOT be relied upon. Session IDs for GET routes SHALL come from a validated path segment, query parameter, or header. An expired or unknown session SHALL return a defined error and SHALL NOT be guessed from content.

## 10. Proxying, retries, and streaming safety

The proxy SHALL use bounded connection, read, write, and total timeouts. Connection-refused and backend-loading failures MAY be retried only when all of the following are true:

- no response headers or body bytes have been sent to the client;
- the request is safe to retry or carries a valid idempotency key;
- the retry budget and overall deadline have not expired;
- the backend state indicates starting or warming rather than a permanent failure.

Backoff SHALL be exponential with jitter and a configured maximum. Retries SHALL stop when the client disconnects.

Once an SSE or other streaming response has begun, the gateway SHALL NOT transparently replay the inference request. If the backend fails mid-stream, the gateway SHALL terminate the stream with a defined error event where the protocol permits and record the partial failure. It SHALL not duplicate tokens.

Hop-by-hop headers SHALL be removed. Authentication headers SHALL not be forwarded unless explicitly required. Response status, content type, streaming framing, and safe headers SHALL be preserved.

## 11. Deterministic role policy and output validation

System prompts SHALL be versioned manifest resources with digests. Client messages SHALL not replace them. The gateway MAY append task-specific instructions but SHALL preserve the immutable role policy.

Prompts are behavioral guidance, not a guarantee. Where syntax matters, the gateway SHALL also use runtime grammar/schema constraints when available and SHALL validate the result before returning success.

### 11.1 Vision extraction policy

The vision agent SHALL:

- produce exhaustive Markdown OCR in reading order;
- represent recoverable tabular rows as valid Markdown tables;
- preserve visible spelling, punctuation, capitalization, and ambiguity;
- mark unreadable content explicitly without inventing text;
- omit greetings, commentary, conclusions, and unsupported assumptions;
- avoid spelling correction unless the client explicitly requests a separate corrected rendition.

The gateway SHALL validate Markdown table shape. Validation failure MAY trigger one bounded repair pass that receives only the generated text and validation errors; it SHALL not invent missing document content.

### 11.2 Schema-validation policy

The schema agent SHALL return one minified JSON value conforming to the requested schema. It SHALL:

- use valid braces, brackets, quoting, escaping, and JSON data types;
- emit `null` for unresolvable required fields when the schema permits it;
- never replace unknown data with a fabricated string;
- emit no prose or Markdown fences.

The gateway SHALL enforce a JSON Schema or runtime grammar where available, parse the returned value, and validate it against the schema. A prompt alone SHALL not constitute compliance.

### 11.3 Audio transcription policies

Audio processing SHALL expose two distinct modes:

- **`verbatim`**: preserve spoken words, hesitations, repetitions, and phrases such as “dot p y” as spoken, subject only to timestamp/speaker formatting requested by the client.
- **`technical_normalized`**: convert high-confidence spoken technical notation, such as “dot p y” to `.py`, while preserving the original phrase in optional alignment metadata.

Both modes SHALL ignore non-speech hum, silence, and isolated ambient dropouts unless the client requests sound-event notation. Low-confidence or unintelligible speech SHALL be marked explicitly rather than guessed.

## 12. Observability and privacy

The system SHALL emit structured logs and metrics for:

- request and correlation ID;
- authenticated principal identifier or privacy-preserving derivative;
- requested and effective alias;
- routing reason;
- queue duration;
- process state transitions;
- model load and readiness duration;
- retries and failure class;
- input modality and bounded metadata, never raw media by default;
- input/output token counts where available;
- speculative draft acceptance and latency;
- GPU allocation and free-memory observations;
- response status and total latency.

Prompt, completion, image, audio, file contents, data URLs, API keys, and authorization headers SHALL NOT be logged by default. Diagnostic content logging SHALL require an explicit protected setting, redaction, retention limit, and visible warning.

## 13. Required compliance tests

An implementation SHALL NOT be declared compliant until automated tests demonstrate:

1. All four aliases resolve only through the manifest and artifact digest failures block startup.
2. Runtime flags match the selected agent profile; `ngram-mod` uses its correct parameters.
3. Unsupported or incompatible speculative pairs fall back to target-only inference.
4. Vulkan device use and expected layer placement are verified rather than assumed.
5. Only a manager-owned process group can be terminated during a swap.
6. Concurrent swap requests do not create two GPU-owning backends.
7. Readiness is health-driven and a stuck cold boot reaches a bounded `503` outcome.
8. Queue capacity, timeout, disconnect cancellation, and `429` behavior work as specified.
9. Image, audio, text, mixed-media, malformed, oversized, and adversarial URL payloads follow the routing and security rules.
10. `/v1/models` and `/props` distinguish native from gateway-accepted capabilities.
11. Session affinity survives allowed follow-up routes, expires on schedule, and is isolated by identity.
12. Pre-stream retries succeed without duplicate execution, while mid-stream failures are never replayed.
13. JSON outputs parse and validate against their schemas.
14. OCR output preserves source spelling and does not fabricate unreadable content.
15. `verbatim` and `technical_normalized` transcription modes produce observably different handling of spoken technical notation.
16. Secrets and raw media are absent from normal logs.

## 14. Configuration items requiring host qualification

The following values SHALL remain configurable and SHALL be frozen only after benchmarks on the actual host:

- runtime build/version and Vulkan device identifier;
- agent artifact hashes and projector compatibility;
- GPU-layer count and minimum free-VRAM reserve;
- batch, micro-batch, KV-cache, and parallel-slot settings;
- CPU thread counts if qualification disproves the defaults;
- cold-start, queue, execution, drain, and retry deadlines;
- n-gram minimum/maximum parameters;
- speculative acceptance-rate and latency-benefit thresholds;
- media size/duration limits;
- session TTL and ledger capacity.

Qualification SHALL record peak RAM/VRAM, time to readiness, prompt-processing speed, generation speed, speculative acceptance rate, error rate, and host responsiveness for every enabled profile.

## 15. Delivery gate

Production enablement requires:

- a validated manifest and artifact inventory;
- a pinned, reproducible runtime build;
- passing compliance and security tests;
- measured host qualification for every enabled agent;
- documented fallback behavior;
- an operator runbook covering startup, swap failures, low-VRAM conditions, stuck processes, log collection, and safe shutdown.

Any experimental capability—including the transplanted-vocabulary Mistral draft model or unverified audio support—SHALL be clearly marked, disabled by default, and incapable of changing the truthful capability contract until its qualification suite passes.
