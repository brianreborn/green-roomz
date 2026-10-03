# Green-Roomz System Requirements

**Product description:** Local Multimodal Agent Runtime  
**Document status:** Final implementation baseline  
**Initial target host:** Windows on AMD Ryzen 5 7520U with approximately 15 GB usable unified system memory and integrated AMD Radeon graphics  
**Secondary target:** Android with a Linux-hosted coordinator and native inference sidecars  
**Normative terms:** **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT**, and **MAY** carry their usual requirements meaning.

## 1. Purpose and scope

Green-Roomz SHALL provide one stable local gateway for a set of specialized agents. Client applications SHALL address functional aliases rather than model filenames, runtime-specific flags, ports, or device identifiers. The system SHALL select a qualified implementation profile for the current host and workload.

Green-Roomz is llama.cpp-first for compatible language and multimodal models, but it is not llama.cpp-only. It SHALL support runtime adapters for purpose-built engines where they are more efficient or reliable, including whisper.cpp, Piper or an equivalent local TTS engine, ONNX Runtime where appropriate, and stable-diffusion.cpp.

The implementation SHALL prioritize useful work per unit of limited compute. It SHALL use measured behavior on the actual host rather than fixed assumptions about CPU threads, GPU offload, context size, speculative decoding, or concurrency.

### 1.1 Required outcomes

The first production-capable release SHALL:

- expose all ten required functional aliases in Section 4;
- run locally without a cloud inference dependency;
- select profiles through repeatable host calibration;
- allow processes to coexist, page, and compete under operator-selected policy;
- provide truthful capability discovery and deterministic routing;
- protect local files, credentials, sessions, and media inputs;
- validate structured outputs instead of trusting prompts alone;
- retain target-only and CPU-safe fallbacks when optional acceleration fails;
- support a Windows deployment first and a defined Android port boundary.

### 1.2 Non-goals

The initial release SHALL NOT require:

- a dedicated translation agent or automatic translation preprocessing;
- music generation, full text-to-video generation, local model training, or a heavyweight computer-use model;
- exclusive ownership of all CPU, GPU, or memory resources;
- a public internet deployment;
- one universal inference runtime for every agent.

## 2. Product identity and naming

The canonical product name SHALL be **Green-Roomz**.

- CLI executable: `green-roomz`
- configuration namespace: `green_roomz`
- gateway service name: `green-roomz-gateway`
- native sidecar service family: `green-roomz-runner-*`
- user-facing documentation title: **Green-Roomz**

The spelling and hyphenation SHALL be preserved in product-facing text. Package ecosystems that prohibit hyphens MAY use `green_roomz` internally.

## 3. System architecture

Green-Roomz SHALL consist of the following independently testable components:

1. **Gateway** — authentication, API compatibility, request limits, payload parsing, routing, streaming, and response validation.
2. **Agent registry** — immutable runtime view of aliases, artifacts, capabilities, prompt policies, profiles, and fallbacks.
3. **Coordinator** — process lifecycle, health, policy enforcement, scheduling, cancellation, and failure recovery.
4. **Runtime adapters** — engine-specific command construction and protocol translation for llama.cpp, whisper.cpp, TTS, diffusion, ONNX, and later engines.
5. **Calibrator** — hardware probing, benchmark search, quality gates, profile ranking, and requalification.
6. **Session ledger** — bounded, identity-scoped session affinity and workflow state.
7. **Artifact inventory** — hashes, licenses, provenance, compatibility metadata, and local paths.
8. **Output validators** — JSON Schema, Markdown table, media, embedding, ranking, and routing-plan validation.
9. **Observability layer** — structured logs, metrics, benchmark results, and health diagnostics.

The gateway and coordinator MAY run in one process initially, but their interfaces SHALL be separable. Runtime adapters SHALL be isolated behind a common runner contract so that a model or engine can be replaced without changing client APIs.

### 3.1 Common runner contract

Every runtime adapter SHALL implement or emulate:

- `probe()` — runtime version, build features, devices, and supported options;
- `validate_artifacts()` — file, hash, format, and compatibility checks;
- `start(profile)` — start or attach to an owned runner;
- `health()` — process, model identity, capability, and readiness state;
- `infer(request, cancellation)` — bounded inference with streaming where supported;
- `metrics()` — runtime and workload measurements;
- `drain(deadline)` — stop accepting work and finish or cancel in-flight work;
- `stop(grace_period)` — graceful then owned-process-group termination;
- `benchmark(profile, corpus_case)` — machine-readable measurement output.

## 4. Functional agent registry

Exactly ten functional aliases SHALL be required for a compliant full installation. An eleventh video alias is optional. The alias is a stable compatibility handle and SHALL NOT guarantee a particular vendor, model family, or engine even where a historical alias contains a model name.

Each required alias SHALL have at least one qualified implementation and one documented degraded or failure behavior. Large runners SHALL be lazy-startable; an alias need not keep its model physically resident at all times.

### 4.1 `vision-layout-agent`

**Purpose:** OCR, document-image extraction, table recovery, screenshot understanding, and structural layout analysis.

**Initial candidate pool:**

- default candidate: Qwen2.5-VL 3B Instruct, Q4-class GGUF, with its exact matching projector;
- quality candidate: a qualified 7B Q4-class vision-language model with matching projector;
- future candidates MAY be added through the manifest without changing the alias.

**Requirements:**

- The 3B-class profile SHOULD be the initial interactive default on the target host if it passes quality gates.
- The 7B-class profile SHALL be treated as an on-demand quality profile, not assumed to be the fastest.
- Model/projector pairing SHALL be validated with a minimal image inference.
- OCR SHALL preserve source language by default.
- The agent SHALL not silently translate, correct, or invent text.
- N-gram speculation MAY be tested, but `ngram-mod` SHALL use its own `--spec-ngram-mod-*` options. `--spec-draft-n-max` SHALL NOT be used as an `ngram-mod` control.

### 4.2 `audio-transcription-agent`

**Purpose:** speech-to-text transcription, timestamps where supported, and optional technical normalization.

**Initial candidate pool:**

- default candidate: Whisper base or small through whisper.cpp, chosen by accuracy and real-time-factor qualification;
- alternative candidate: Qwen3-ASR 0.6B or another small supported ASR model after exact-runtime qualification;
- larger or experimental audio-language models SHALL remain disabled until they pass the same tests.

**Requirements:**

- The default mode SHALL transcribe in the spoken language.
- `verbatim` and `technical_normalized` SHALL be distinct request modes as defined in Section 12.3.
- Audio-language support described by an engine as experimental SHALL be advertised as experimental.
- The ASR runner MAY remain CPU-resident while a language model uses Vulkan.
- Transcription SHALL not automatically invoke translation.

### 4.3 `qwenstral-code-speculator`

**Purpose:** source-code generation and transformation, code explanation, constrained JSON, and structural text work.

**Initial candidate pool:**

- interactive candidate: Qwen2.5-Coder 3B Instruct, Q4-class;
- draft candidate: a tokenizer-compatible Qwen2.5-Coder 0.5B or 1.5B model;
- quality candidate: Qwen2.5-Coder 7B Instruct, Q4-class.

**Requirements:**

- The 3B candidate SHOULD be tried before the 7B candidate for interactive use on the initial host.
- Draft-model speculation SHALL be disabled automatically when compatibility, acceptance rate, quality equivalence, or end-to-end speed gates fail.
- Target-only inference SHALL always remain available.
- Projectors SHALL be prohibited for this alias.
- JSON responses SHALL be grammar- or schema-constrained where the runtime supports it and validated by the gateway.

### 4.4 `general-text-speculator`

**Purpose:** general reasoning, natural-language writing, summarization, contextual verification, extraction, and explicit human-language translation.

**Initial implementation:**

- target GGUF source: Hugging Face repository `Qwen/Qwen3-4B-GGUF`, `Q4_K_M` quantization;
- canonical target-model/tokenizer source: Hugging Face repository `Qwen/Qwen3-4B`;
- EAGLE3 draft source: Hugging Face repository `AngelSlim/Qwen3-4B_eagle3`;
- draft conversion: the pinned llama.cpp `convert_hf_to_gguf.py` SHALL convert the exact `AngelSlim/Qwen3-4B_eagle3` snapshot with `--target-model-dir` pointing to the exact local snapshot of `Qwen/Qwen3-4B`;
- inference mode: target GGUF plus the converted draft GGUF using `--spec-type draft-eagle3` and the installed build's draft-model argument.

**Requirements:**

- Artifact records SHALL pin repository revisions, local filenames, byte sizes, and SHA-256 hashes; repository names or matching name fragments SHALL never be sufficient evidence that a target/draft pair is compatible.
- Target-only `Qwen/Qwen3-4B-GGUF` operation SHALL be a mandatory qualified profile and SHALL be selected automatically when the draft is absent, fails conversion or load, remains unqualified, produces nonequivalent output, or fails to deliver the configured benefit.
- EAGLE3 SHALL remain disabled until the pair passes the load, output-equivalence, and end-to-end benefit gates in Section 6.1 on the installed runtime and host.
- This SHALL be the default agent for human-language translation only when translation is explicitly requested or declared by a configured workflow.
- Projectors SHALL be prohibited for this alias.
- The selected target-only or EAGLE3 profile SHALL be visible in response metadata when diagnostics are enabled.

### 4.5 `semantic-embedding-agent`

**Purpose:** vector embeddings for local retrieval, semantic search, clustering, similarity, and duplicate detection.

**Initial candidate:** Qwen3-Embedding 0.6B or an equivalent small multilingual embedding model supported by the selected engine.

**Requirements:**

- The endpoint SHALL support a manifest-declared set of output dimensions, with 512 or 1024 as initial candidates where supported.
- Returned dimensions, normalization, pooling, input limits, and model identity SHALL be stable within a manifest version.
- The embedding model SHOULD remain resident when its measured footprint and workload make that beneficial.
- Embedding output SHALL never be presented as translated or generated text.

### 4.6 `retrieval-rerank-agent`

**Purpose:** score query-document relevance and reduce retrieved candidates before generation.

**Initial candidate:** Qwen3-Reranker 0.6B or an equivalent small cross-encoder reranker.

**Requirements:**

- Embedding and reranking SHALL be independent profiles and endpoints, even if one runtime can expose both.
- Input order, returned scores, score direction, tie handling, and selected top-k SHALL be deterministic and documented.
- A typical workflow SHOULD rerank a bounded candidate set and forward only the best passages to a generative agent.
- The gateway SHALL enforce query, document, pair-count, and total-token limits.

### 4.7 `tool-router-agent`

**Purpose:** choose an allowed tool or agent and produce a short, schema-valid execution plan.

**Initial implementation:** deterministic rules first, with Qwen3 0.6B Q4-class or an equivalent small instruction model for ambiguous cases.

**Requirements:**

- The router SHALL emit data, not conversational prose.
- Output SHALL conform to a versioned JSON Schema and include route, confidence, reason code, required modalities, and allowed tool arguments.
- Maximum generated output SHOULD be approximately 64–128 tokens unless the schema requires more.
- The router SHALL not execute tools. A separate deterministic policy layer SHALL validate and authorize every proposed action.
- File, network, shell, and external-service tools SHALL use explicit allow-lists and least privilege.

### 4.8 `safety-policy-agent`

**Purpose:** structured input/output risk classification and policy labeling.

**Initial candidate:** Qwen3Guard-Gen 0.6B Q4-class or an equivalent small local classifier.

**Requirements:**

- Results SHALL be structured category labels, confidence values where meaningful, and reason codes.
- The agent SHALL augment, not replace, authentication, URL filtering, filesystem boundaries, request limits, or tool allow-lists.
- Deterministic security controls SHALL remain authoritative if classifier output conflicts with them.
- The deployment SHALL define whether a category blocks, warns, redacts, or only records; the model SHALL not make that authorization decision by itself.

### 4.9 `speech-synthesis-agent`

**Purpose:** local text-to-speech with selectable voice, language, speed, and output format.

**Initial candidate pool:** Piper as the baseline; Kokoro-82M through a qualified ONNX path MAY be offered as a quality alternative.

**Requirements:**

- The default runner SHOULD use CPU resources so it need not evict or block a Vulkan text model.
- PCM/WAV streaming SHOULD be supported; any additional format SHALL be explicitly advertised.
- The response SHALL declare sample rate, channel count, encoding, voice, and language.
- Inputs SHALL have length and synthesis-time limits.
- Generated audio SHALL be validated as decodable before success is returned.

### 4.10 `image-generation-agent`

**Purpose:** local text-to-image generation and, after separate qualification, image-to-image or editing.

**Initial candidate:** a compact or quantized Stable Diffusion 1.5 checkpoint through stable-diffusion.cpp.

**Requirements:**

- Initial defaults SHALL be one 512×512 image and batch size one.
- Generation SHALL be modeled as a queued, cancellable, long-running job with progress where available.
- Larger diffusion families SHALL not be enabled by default on the initial host.
- The runner MAY use Vulkan only when benchmarked faster and stable; CPU execution SHALL remain a possible fallback.
- Output dimensions, format, seed, effective steps, sampler, elapsed time, and profile SHALL be returned in metadata.

### 4.11 Optional `video-understanding-agent`

Video understanding MAY be exposed as an eleventh alias after qualification. The initial implementation SHOULD compose:

1. bounded frame sampling;
2. audio extraction and transcription;
3. vision analysis of selected frames;
4. general-text synthesis of the time-aligned results.

A small video-capable model such as a SmolVLM2-class candidate MAY be evaluated. Continuous video inference and video generation are out of scope for the initial release. Video SHALL not be included in the count of ten required aliases.

## 5. Translation policy

Translation is a shared language capability, not a dedicated agent.

- Green-Roomz SHALL NOT define a `translation-agent` or provision a model solely for translation.
- The gateway SHALL NOT translate merely because it detects a language different from the operator or UI language.
- OCR and transcription SHALL preserve the source language by default.
- Translation MAY occur when explicitly requested by the user or required by an explicitly configured workflow.
- `general-text-speculator` SHALL be the default local route for ordinary human-language translation only after an explicit translation request or workflow declaration.
- Code translation of comments, strings, or documentation MAY route to `qwenstral-code-speculator` when code preservation is central to the request.
- An operator-configured translation tool MAY override the local route for an explicit request.
- Capability discovery MAY describe translation as a shared text operation, but SHALL NOT advertise it as an agent, automatic preprocessor, or guaranteed native capability of non-generative agents.

## 6. Registry and artifact manifest

The coordinator SHALL load a versioned, read-only manifest. Runtime mutation SHALL require validation and an atomic reload or controlled restart.

Each manifest SHALL include:

- schema and manifest versions;
- a canonical manifest SHA-256 digest;
- all required aliases and optional aliases;
- runtime adapter and compatible runtime version range;
- artifact path, byte size, SHA-256, format, quantization, source, license, and license notice;
- model, tokenizer, projector, adapter, and draft-model relationships;
- native and gateway-accepted capabilities as separate fields;
- prompt-policy and output-schema digests;
- candidate benchmark profiles and safe fallbacks;
- context, batch, micro-batch, KV-cache, thread, device, and speculation candidates;
- endpoint and media limits;
- qualification status and benchmark-result reference.

Secrets SHALL NOT be stored in the manifest.

Startup SHALL fail closed for a required alias when its selected artifact is absent, has the wrong digest, violates its license policy, is unsupported by the runtime, or cannot pass a minimal smoke test. One alias failing SHALL not require healthy unrelated aliases to stop; the overall gateway SHALL report a degraded state until all required aliases are qualified.

### 6.1 Speculative-decoding preflight

Before enabling target/draft speculation, the calibrator SHALL verify:

1. the exact source revisions and SHA-256 hashes of the target, canonical target-model directory, draft source, and converted draft;
2. that draft conversion used the recorded canonical target snapshot through `--target-model-dir`, rather than pairing artifacts by repository or filename resemblance;
3. compatible tokenizer and token-ID semantics, vocabulary size, hidden-size metadata, and special tokens;
4. runtime support for the target, draft architecture, and selected speculation type;
5. successful loading of the target and draft together;
6. stable completion of a fixed smoke corpus;
7. greedy-output equivalence to target-only decoding for the equivalence corpus;
8. a configured minimum accepted-draft-token rate;
9. a configured end-to-end latency or throughput benefit.

A failed speculation preflight SHALL disable speculation, not the target model. For `general-text-speculator`, `AngelSlim/Qwen3-4B_eagle3` SHALL be enabled only as the converted, hash-bound companion to the recorded `Qwen/Qwen3-4B` lineage and only after every gate passes.

### 6.2 Installed llama.cpp support baseline

At this requirements freeze, the installed Windows binary at `C:\LocalAI\llama-b10665-bin-win-vulkan-x64\llama-server.exe` reports llama.cpp `0.3.0-dev`, build `10665`, commit `ca3d5a3e1`, built with Clang 20.1.8 for Windows x86_64. Its help output exposes `draft-eagle3` in `--spec-type`, the draft-model argument, and draft-specific device, thread, cache, and GPU-layer controls. The locally installed `C:\LocalAI\llama.cpp-0.3.0\convert_hf_to_gguf.py` exposes `--target-model-dir` for standalone EAGLE3 conversion.

This observation establishes that the installed build has the required command surface; it does not qualify the model pair. The manifest SHALL pin the effective executable digest and converter revision, and the pair SHALL still pass Section 6.1 plus the benchmark gates before speculative operation is enabled.

## 7. Hardware and execution policy

### 7.1 Initial Windows host

The first implementation SHALL qualify on the actual Ryzen 5 7520U Windows host with approximately 15 GB usable unified memory and integrated AMD graphics. Green-Roomz SHALL treat CPU and integrated-GPU memory as contending for the same limited system resource.

The implementation SHALL probe rather than assume:

- physical/logical CPU topology;
- available instruction sets;
- total and committed memory;
- Vulkan availability, device identity, driver, heap information, and runtime build support;
- power mode and, where accessible, thermal state;
- installed runtime features and supported flags.

### 7.2 Paging and process competition

Paging is an accepted operating condition.

- Model processes MAY remain loaded concurrently.
- The coordinator SHALL allow processes to compete for CPU, GPU, memory bandwidth, committed memory, filesystem cache, and OS paging according to the selected operating policy.
- The operating system SHALL remain authoritative for paging, compression, scheduling, and memory reclamation.
- Green-Roomz SHALL NOT kill a healthy runner merely to launch a different runner unless an explicit policy, operator action, or measured recovery rule calls for eviction.
- Green-Roomz SHALL NOT reject a launch solely because a forecast predicts paging or low free RAM.
- `mlock` or equivalent nonpageable locking SHALL be disabled by default.
- Page faults, commit usage, working set, and paging delay SHALL be measured as performance signals, not treated as automatic correctness failures.
- Actual allocation failure, process death, or an unresponsive host MAY trigger a qualified smaller profile, a bounded restart, or a clear error.

The implementation SHALL avoid a global mutex that serializes all inference and SHALL avoid a global single-backend mandate. Locks SHALL be scoped to registry mutation, a specific runner lifecycle, a specific session, or a resource transition that truly requires mutual exclusion.

### 7.3 Operating policies

The operator SHALL be able to select one of three policies. Policy changes SHALL be observable and SHALL not corrupt in-flight sessions.

#### `responsive`

- Prioritize foreground request latency and desktop responsiveness.
- Permit resident background runners, but MAY limit simultaneous heavy inference after qualification.
- MAY lower background process priority and queue bulk/image jobs.
- SHALL prefer the interactive benchmark profile.

#### `balanced`

- Admit measured concurrency that improves total useful throughput without unacceptable interactive latency.
- Use calibrated concurrency and priority values for the active workload mix.
- SHALL prefer interactive profiles for foreground requests and bulk profiles for queued work.

#### `maximize`

- Allow qualified runners and jobs to compete with minimal coordinator throttling.
- Do not perform proactive memory-based eviction or admission refusal.
- Use normal OS scheduling unless the operator configures otherwise.
- Permit paging and oversubscription; expose their measured consequences.
- Enforce only correctness, security, explicit user limits, runtime hard limits, and recovery from actual failure.

`maximize` SHALL not mean bypassing authentication, media limits, cancellation, process ownership checks, or output validation.

### 7.4 CPU, Vulkan, context, and KV-cache settings

No fixed value such as three threads, four batch threads, twelve GPU layers, or one context size SHALL be a universal requirement.

- CPU thread counts SHALL be benchmark candidates.
- GPU layers SHALL include CPU-only, several hybrid points, and full offload where supported.
- The selected Vulkan device SHALL be explicit and verified from runtime reporting.
- `--split-mode none` MAY be used for the single integrated device, but only where supported and beneficial.
- `VK_LOADER_DEBUG=all` SHALL be off in normal operation and available only as bounded diagnostics.
- `GGML_VULKAN=1` SHALL NOT count as proof that Vulkan is active; the build and tensor placement SHALL be verified.
- Context tiers SHALL be chosen by workload need and benchmarked memory/latency cost. Longer context SHALL not be enabled merely because a model advertises it.
- F16, Q8, and other supported KV-cache types SHALL be tested where quality gates permit.
- Batch size, micro-batch size, parallel slots, and memory mapping SHALL be profile settings.

## 8. Benchmarking and adaptive calibration

Benchmarking SHALL be a first-class subsystem, not a one-time development script. It SHALL be callable from the CLI, available through a protected administrative API, resumable after interruption, and cancellable.

### 8.1 Calibration flow

Calibration SHALL proceed in bounded passes:

1. **Probe and priors** — fingerprint the host and load exact-match results or locally stored priors from similar systems.
2. **Smoke pass** — eliminate configurations that fail to load, crash, produce invalid output, or violate hard quality gates.
3. **Coarse pass** — sample the major CPU/GPU/context/KV/speculation choices with short workloads.
4. **Successive refinement** — retain the Pareto-leading candidates and search more densely around them instead of evaluating the full Cartesian product.
5. **Confirmation pass** — repeat finalists enough times to report variance and reject unstable wins.
6. **Contention pass** — measure important concurrent combinations under `responsive`, `balanced`, and `maximize`.
7. **Sustained pass** — run a longer workload to observe throttling, paging, thermal decline, and process survival.
8. **Profile publication** — atomically publish qualified winners while retaining the last known-good profile.

The search algorithm MAY use successive halving, Bayesian optimization, or another bounded adaptive method. It SHALL preserve raw measurements and selection reasons so results remain auditable.

### 8.2 Candidate dimensions

For llama.cpp-style text models, initial candidate generation SHOULD include:

- generation threads: 2, 3, 4, 6, and 8 where supported;
- batch threads: 2, 4, 6, and 8 where supported;
- GPU layers: 0, coarse hybrid fractions, and all supported layers, followed by local refinement;
- context tiers: approximately 2K, 4K, 8K, and longer only for agents that demonstrate a need;
- batch and micro-batch sizes;
- KV-cache types supported by the build;
- memory mapping on/off where supported;
- speculation disabled and each compatible speculation mode enabled;
- practical parallel-slot and request-concurrency values.

Candidate sets SHALL be adapted to the actual runtime and SHALL not pass unsupported flags.

### 8.3 Profiles and scoring

At least two winners SHALL be stored per generative model when qualified:

- **interactive profile:** prioritizes time to first token, generation speed, and foreground latency;
- **bulk profile:** prioritizes prompt ingestion and completed work per unit time.

A constrained fallback MAY also be stored for recovery from actual allocation failure. A faster profile SHALL not win if it fails correctness or quality thresholds.

Generative-model measurements SHALL include:

- cold and warm readiness time;
- prompt-processing tokens per second;
- generation tokens per second;
- time to first token;
- p50/p95 end-to-end latency;
- peak working set, commit, page faults, and paging delay;
- CPU/GPU utilization where available;
- speculative acceptance and rejected-draft overhead;
- error, crash, and invalid-output rate;
- quality/equivalence score on the agent corpus.

Specialized-agent measurements SHALL include:

- vision: seconds per page/image, OCR error, table-structure accuracy, and unsupported invention rate;
- ASR: audio real-time factor, word/character error rate, timestamp error, and source-language preservation;
- embeddings: items and tokens per second, retrieval recall on the local corpus, and dimensional correctness;
- reranking: query-document pairs per second and ranking quality;
- routing: decision accuracy, schema validity, latency, and unauthorized-route rate;
- safety: category precision/recall on the approved corpus and latency;
- TTS: synthesis real-time factor, startup latency, audio validity, and configured quality checks;
- image generation: seconds per image, peak commit, failure rate, and deterministic-seed reproducibility where supported.

### 8.4 Contention and sustained testing

The contention pass SHALL test representative mixes, including:

- text generation while embeddings remain resident;
- text generation plus reranking;
- ASR plus text generation;
- TTS plus text generation;
- two independent text requests where the profile supports parallel slots;
- image generation competing with an interactive text request;
- multiple resident runners with only one active;
- multiple active runners under `maximize`.

Tests SHALL record whether increased concurrency improves completed work or merely increases paging and latency. The benchmark report SHALL present the trade-off; it SHALL not declare paging itself a failure.

### 8.5 Cache key, reuse, and requalification

An exact benchmark cache key SHALL include:

- CPU model and topology;
- memory size class;
- GPU/device identifier;
- graphics driver and Vulkan runtime versions;
- OS build or Android/kernel version;
- inference runtime version, build hash, and feature flags;
- model, projector, adapter, tokenizer, and draft-model hashes;
- benchmark corpus and scoring version;
- power/thermal mode when distinguishable;
- relevant profile settings.

Green-Roomz MAY keep a local library of results from similar systems and use them only as search priors. An approximate hardware match SHALL never replace local confirmation. Sharing benchmark results off-device SHALL be opt-in, exclude prompts/media and secrets, and show the data to be shared.

Requalification SHALL occur when a cache-key component changes, the operator requests it, no qualified profile exists, or production telemetry shows material sustained drift. Ordinary minor variance SHALL not cause calibration loops.

## 9. Process lifecycle and failure recovery

Each runner SHALL have an independent state machine:

`ABSENT → STARTING → WARMING → READY ↔ BUSY → DRAINING → STOPPING → ABSENT`

`DEGRADED` and `FAILED` SHALL be reachable from appropriate states. Multiple runners MAY be `READY` or `BUSY` concurrently.

### 9.1 Process ownership

For every launched process, the coordinator SHALL retain:

- PID plus process-group or Windows Job Object identity;
- creation time and executable path;
- command/configuration fingerprint;
- owning alias, runtime adapter, ports or socket paths;
- stdout/stderr capture handles;
- artifact and profile identifiers.

Green-Roomz SHALL terminate only processes it can prove it owns. It SHALL NOT kill arbitrary processes by executable name, port, ancestry, or model filename. Shutdown SHALL attempt graceful drain, then graceful termination, then terminate only the owned group after a bounded deadline.

### 9.2 Readiness

Fixed post-launch sleeps SHALL NOT establish readiness. A runner SHALL become ready only after:

- the process remains alive;
- health or an equivalent probe succeeds;
- expected model/artifact identity is reported or otherwise verified;
- required capabilities are present;
- an optional warm-up request succeeds.

Cold-start deadlines SHALL be configurable by runtime and model class. A failed cold start SHALL produce a structured failure and MAY try one qualified fallback. The system SHALL not loop indefinitely.

### 9.3 Queueing, cancellation, and restart

- Queues SHALL be bounded per endpoint or workload class.
- Queue and execution deadlines SHALL be configurable.
- Client disconnect SHALL cancel queued work and SHOULD cancel active work where the runtime supports it.
- Queue overflow SHALL return `429`; temporarily unavailable agents SHALL return `503` with `Retry-After` when useful.
- A runner crash MAY be restarted with bounded exponential backoff and a circuit breaker.
- Repeated failure SHALL leave the alias degraded and preserve healthy unrelated runners.
- Idempotency keys SHALL be supported for retryable non-streaming jobs where practical.

## 10. Gateway API, routing, and security

### 10.1 Network boundary

- The default gateway binding SHALL be loopback-only.
- Runtime backends SHALL bind to loopback or a protected local socket and SHALL not be directly exposed.
- A non-loopback binding SHALL require authentication, explicit CORS policy, request limits, and TLS either in Green-Roomz or an authenticated reverse proxy.
- Secrets SHALL come from protected environment/configuration facilities, not the agent manifest.
- Metrics and administrative calibration endpoints SHALL be protected and disabled from public exposure by default.

### 10.2 Core endpoints

The gateway SHOULD provide OpenAI-compatible shapes where sensible and SHALL document extensions:

- `/health` and `/v1/health`;
- `/v1/models` and `/props` when compatibility requires it;
- `/v1/chat/completions` for text, code, and composed vision requests;
- `/v1/embeddings`;
- `/v1/rerank` as a documented extension;
- `/v1/audio/transcriptions`;
- `/v1/audio/speech`;
- `/v1/images/generations`;
- `/v1/moderations` or an internal equivalent for structured safety labels;
- protected administrative benchmark/profile endpoints;
- `/metrics`, protected by default.

Explicit routes SHALL be registered before an allow-listed catch-all proxy. Unknown routes SHALL return `404`; unsupported methods SHALL return `405`. Requests SHALL not be blindly forwarded.

### 10.3 Truthful capability discovery

Model and alias records SHALL distinguish:

- `native_capabilities` — verified directly on the selected runner;
- `gateway_accepted_capabilities` — inputs Green-Roomz can fulfill by safe routing or composition;
- `routing_behavior` — direct, overridden, or composed;
- `availability` — ready, cold, busy, degraded, or unavailable;
- `qualification` — profile and benchmark status;
- `experimental_features` — unqualified or opt-in functions.

Green-Roomz SHALL NOT claim every backend natively supports vision or audio. A legacy compatibility boolean MAY describe the gateway facade only if the gateway can actually complete the request and accurate native fields are also present.

### 10.4 Payload parsing and routing

The gateway SHALL parse the request schema structurally and SHALL NOT route by unvalidated raw-byte substring search.

Routing precedence SHALL be deterministic:

1. Explicit endpoint and explicit valid functional alias take precedence for compatible inputs.
2. Audio on a transcription endpoint routes to `audio-transcription-agent`.
3. Image/document media routes to `vision-layout-agent` or an explicitly qualified composed workflow.
4. Text-only requests use the requested alias or `general-text-speculator` as the configured general default.
5. Structured code tasks MAY route to `qwenstral-code-speculator` when selected explicitly or by an authorized router plan.
6. Mixed image and audio SHALL be rejected unless the optional video or another qualified composed workflow handles both.
7. Unknown aliases SHALL return `400` with the allowed aliases.

Audit metadata SHALL preserve both the requested and effective alias, plus the routing reason. Media routing SHALL not imply translation.

### 10.5 Input security

The gateway SHALL enforce:

- API authentication outside explicit loopback development mode;
- per-identity rate and concurrency limits;
- request-body, upload, and decoded-media limits;
- content-based MIME validation and allow-lists;
- image pixel/dimension limits;
- audio duration, channel, and sample-rate limits;
- archive and decompression-bomb defenses;
- sanitized filenames and prohibition of client-controlled filesystem paths;
- isolated temporary files with bounded lifetime and guaranteed cleanup;
- strict browser CORS allow-lists;
- SSRF defenses for URLs, including scheme allow-lists, DNS/IP checks before and after redirects, redirect count, byte limits, and deadlines;
- separation of untrusted document/media content from system and tool instructions.

## 11. Sessions, proxying, retries, and streaming

### 11.1 Session ledger

The preferred session key SHALL be a gateway-issued opaque identifier. A validated `conv_id` MAY be supported for compatibility.

Every entry SHALL record:

- effective alias and workflow;
- verified modality;
- creation, access, and expiry timestamps;
- owning authenticated identity;
- bounded backend conversation metadata without raw secrets.

The ledger SHALL be concurrency-safe and have configurable TTL, total capacity, per-identity capacity, and deterministic eviction. One identity SHALL not access another identity's session. GET request bodies SHALL not be relied upon; session IDs SHALL use validated headers, query parameters, or paths.

### 11.2 Retrying and streaming

Connection failures MAY be retried only before response headers or body bytes reach the client, within a bounded retry and total-time budget, and only when the request is safe or idempotent.

Once SSE or another response stream begins, Green-Roomz SHALL NOT replay inference transparently. A mid-stream failure SHALL end with a defined error event where possible and SHALL never duplicate tokens. Retries SHALL stop on client disconnect.

Hop-by-hop headers SHALL be removed. Client authorization headers SHALL not be forwarded to local runners unless explicitly required. Content type, safe headers, status, and streaming framing SHALL be preserved.

## 12. Prompt policy and output validation

System prompts and validators SHALL be versioned manifest resources with digests. Client content SHALL not replace the system policy. Prompt instructions alone SHALL never be treated as proof of valid JSON, safe routing, faithful OCR, or valid media.

### 12.1 Vision/layout output

The vision agent SHALL:

- emit exhaustive Markdown OCR in reading order;
- use valid Markdown tables for recoverable tabular data;
- preserve visible spelling, punctuation, capitalization, language, and ambiguity;
- mark unreadable content without inventing text;
- omit greetings, conclusions, and unsupported assumptions;
- correct or translate only through a separately explicit request.

The gateway SHALL validate Markdown table shape. It MAY perform one bounded formatting-repair pass using only generated text and validation errors. That repair SHALL not invent missing document content.

### 12.2 Code and JSON output

When JSON is requested, the selected generative agent SHALL return one valid JSON value without prose or Markdown fences. The gateway SHALL use a runtime grammar or JSON Schema constraint where available, parse the result, and validate the schema.

Unknown required values SHALL use `null` only when permitted by the schema. The agent SHALL not fabricate placeholder strings. Failed validation MAY trigger one bounded repair attempt; otherwise the gateway SHALL return a structured validation error.

### 12.3 Transcription modes

- **`verbatim`:** preserve spoken words, hesitations, repetitions, and phrases such as “dot p y” as spoken, subject only to requested timestamp/speaker formatting.
- **`technical_normalized`:** convert high-confidence spoken technical notation such as “dot p y” to `.py`; optional alignment metadata SHOULD preserve the original phrase and confidence.

Both modes SHALL ignore ordinary silence, hum, and isolated ambient dropouts unless sound-event notation is requested. Unintelligible speech SHALL be marked, not guessed. Neither mode SHALL translate automatically.

### 12.4 Embedding and reranking output

Embedding responses SHALL validate vector count, dimension, finite numeric values, normalization policy, and input-to-output order. Reranking responses SHALL validate candidate identity, unique ranking positions, finite scores, top-k limits, and deterministic tie behavior.

### 12.5 Tool routing and safety output

Router and safety outputs SHALL pass their versioned schemas. A malformed router plan SHALL execute nothing. A route or tool argument outside deterministic policy SHALL be denied even if model confidence is high.

### 12.6 TTS and image output

TTS output SHALL be decoded or header-validated before success. Image output SHALL be decoded, checked for requested/bounded dimensions and format, and written only to a server-controlled output location or returned directly. Partial or corrupt media SHALL not receive a success status.

## 13. Android deployment requirements

Android support SHALL use a split architecture unless a direct in-container accelerator path independently passes the same qualification suite.

### 13.1 Coordinator/container boundary

The Linux container, proot environment, or Termux-hosted layer SHOULD run:

- gateway and coordinator;
- registry and artifact metadata;
- session ledger;
- benchmark orchestration;
- vector index and ordinary local services;
- routing and output validation.

A native Android app/service SHOULD run accelerator-sensitive engines:

- llama.cpp language and vision runners;
- whisper.cpp or another native ASR runner;
- native/ONNX TTS;
- diffusion where qualified.

Container and native layers SHALL communicate over loopback or a permission-protected Unix-domain socket with protocol-version negotiation, mutual local authentication, bounded messages, cancellation, health, and correlation IDs.

Green-Roomz SHALL NOT assume a Linux container can access Vulkan, Android GPU devices, thermal APIs, audio devices, or power-management services. If direct access probes and benchmarks successfully, the container adapter MAY be used; otherwise the native sidecar SHALL be used.

### 13.2 Android operating behavior

- Android Low Memory Killer/process death SHALL be treated as a recoverable runner failure, not prevented through unsafe global memory locking.
- Paging, zram, compression, and process competition MAY occur under the OS as on Windows.
- A persistent deployment SHOULD use an Android foreground service and comply with current background-execution rules.
- Benchmark fingerprints SHALL include SoC, RAM class, Android build, kernel, GPU/Vulkan driver, runtime ABI/build, battery state, and thermal/power mode.
- Mobile sustained tests SHALL measure battery draw where available, thermal state, throttling, and background survival.
- Small 0.5B–3B Q4-class models SHOULD be mobile defaults; 7B-class models SHALL be optional quality profiles.
- Image generation SHOULD be optional and MAY be marked charger-preferred after measurement.
- Video SHOULD use bounded frame/audio composition before attempting continuous inference.

The same `responsive`, `balanced`, and `maximize` policies SHALL exist on Android, with platform-specific settings selected by calibration.

## 14. Observability, privacy, and administration

Structured logs and metrics SHALL include:

- request and correlation identifiers;
- privacy-preserving principal identifier;
- requested/effective alias and route reason;
- policy and selected profile;
- queue, readiness, inference, and total duration;
- runner state transitions, restart, and failure class;
- input modality and bounded metadata;
- token counts and speculative acceptance where available;
- CPU/GPU utilization, commit, working set, page faults, and paging delay where available;
- validation result and response status;
- benchmark scores, variance, and selection reason.

Prompts, completions, images, audio, file contents, data URLs, API keys, authorization headers, and raw tool secrets SHALL NOT be logged by default. Diagnostic content logging SHALL require explicit protected configuration, redaction, a retention limit, and a visible warning.

The CLI SHALL provide at least:

- `green-roomz doctor` — probe runtimes, devices, artifacts, ports, and permissions;
- `green-roomz agents` — list aliases, implementations, status, and capabilities;
- `green-roomz benchmark` — run quick, full, agent-specific, or contention calibration;
- `green-roomz profiles` — inspect selected and historical profiles;
- `green-roomz serve` — start the gateway/coordinator;
- `green-roomz stop` — request a safe shutdown of owned services.

## 15. Compliance tests

An implementation SHALL NOT be declared compliant until automated tests demonstrate all of the following.

### 15.1 Registry and artifacts

1. Exactly ten required aliases exist; video is optional and translation is not an alias.
2. Missing or mismatched artifacts fail only the affected alias and make overall health degraded.
3. Runtime, model, projector, tokenizer, and draft compatibility checks work.
4. Native and gateway-accepted capabilities remain distinct and truthful.
5. Licenses, provenance, and hashes are present for provisioned artifacts.

### 15.2 Hardware and profiles

6. Fixed twelve-layer, fixed-thread, and fixed-context assumptions are absent from selection logic.
7. CPU-only, hybrid, and full-offload candidates are tested when supported.
8. Vulkan use and tensor placement are verified rather than inferred from environment variables.
9. The calibrator performs coarse search, refinement, confirmation, and atomic profile publication.
10. An invalid but fast profile cannot beat a valid profile.
11. Cache invalidation occurs for runtime, driver, artifact, corpus, or material hardware changes.
12. Similar-system results are priors only and local confirmation occurs.

### 15.3 Paging, concurrency, and lifecycle

13. Multiple healthy runners can remain resident.
14. `maximize` admits competing workloads without predicted-memory eviction or rejection.
15. Paging metrics are recorded without treating paging alone as failure.
16. `responsive` can protect foreground latency according to its qualified profile.
17. No global lock serializes unrelated inference.
18. Readiness uses health checks rather than fixed sleeps.
19. Only manager-owned process groups can be terminated.
20. Crash restart, circuit breaking, queue limits, cancellation, `429`, and `503` behavior work.

### 15.4 Routing, security, and sessions

21. Text, image, audio, malformed, oversized, mixed-media, and adversarial URL requests follow deterministic routing and limits.
22. Public/non-loopback binding cannot start without the configured security requirements.
23. SSRF, path traversal, decompression bomb, and cross-identity session tests pass.
24. GET bodies are not needed for affinity.
25. Requested and effective aliases remain auditable.
26. Safety/router model output cannot bypass deterministic authorization.

### 15.5 Output and streaming

27. JSON parses and validates against the requested schema.
28. OCR preserves source spelling/language and does not fabricate unreadable content.
29. `verbatim` and `technical_normalized` treat spoken technical notation differently.
30. Translation occurs only after an explicit request or workflow declaration.
31. Embedding dimensions and rerank ordering validate.
32. TTS and image outputs decode before success.
33. Pre-stream retry cannot duplicate execution; mid-stream failure is never replayed.
34. Secrets and raw media are absent from normal logs.

### 15.6 Specialized quality gates

35. Every required agent passes its approved local qualification corpus.
36. The general-text agent passes explicit translation cases without changing the source-language defaults of OCR/ASR.
37. The converted `AngelSlim/Qwen3-4B_eagle3` draft loads only with its hash-bound `Qwen/Qwen3-4B` lineage and passes output-equivalence and measured-benefit gates; otherwise `general-text-speculator` automatically uses target-only inference.
38. Image generation completes at the bounded default resolution without destabilizing unrelated healthy services under at least one policy.
39. Android sidecar protocol tests pass before Android is declared supported.

## 16. Delivery sequence and gates

### Gate A — Reproducible foundation

- source tree and configuration schema established;
- runtime adapters expose the common contract;
- exact runtime builds and artifact inventory pinned;
- loopback gateway, registry, ownership-safe lifecycle, and health endpoints pass tests.

### Gate B — Windows vertical slice

- general text, code, and one specialized agent operate end to end;
- quick calibration selects real profiles on the Ryzen 5 7520U host;
- CPU-only, hybrid, and Vulkan results are preserved;
- paging/process competition and all three policies behave as specified.

### Gate C — Ten-agent completion

- all ten aliases are provisioned and qualified;
- all endpoints, routing, validators, session controls, and security tests pass;
- interactive and bulk profiles exist where applicable;
- operator runbook covers startup, degraded aliases, restart, calibration, logs, and safe shutdown.

### Gate D — Sustained host qualification

- contention and sustained benchmark passes complete;
- profile selection reasons and trade-offs are reviewed;
- no fixed hardware assumption overrides measured winners;
- last-known-good rollback is tested.

### Gate E — Android support

- coordinator/container and native-sidecar boundary implemented;
- device-specific probe, benchmark, thermal, battery, and process-survival tests complete;
- the supported Android deployment method and limitations are documented.

Production enablement SHALL require Gates A through D. Gate E is required only for an Android-supported release.

## 17. Definition of done

Green-Roomz is implementation-ready when this document is accepted as the baseline, the initial artifact candidates and evaluation corpus are pinned, and Gate A work can begin without further architectural decisions.

Green-Roomz is production-ready on the initial Windows host only when:

- every required alias is available and qualified;
- automated compliance and security tests pass;
- calibration has selected and confirmed host-specific profiles;
- target-only/CPU-safe fallbacks are documented and tested;
- process competition, paging, cancellation, and failure recovery have been exercised;
- capability discovery is truthful;
- translation remains explicit and shared rather than automatic or dedicated;
- an operator can reproduce, inspect, and roll back the installed configuration.
