# Covert-channel fix pack — Green-Roomz defense inventory

**Author role:** Covert Channel Fixer (inventory only)  
**Date:** 2026-09-12  
**Trees examined:** `/workspace/session/green-roomz` (session), `/workspace/grz-src` (ahead patch pack)  
**Reviews scanned:** `/workspace/reviews/covert/` (empty), `/workspace/reviews/green-roomz/RELEASE-READINESS.md`  
**Scope rules:** defensive inventory + patch sketches only; no exploit/PoC/timing recipes; no clone/push/reboot.

**Legend — Present?** `yes` = intentional defense exists and is roughly complete · `partial` = related controls exist but gaps remain · `no` = absent.

---

## Board note

`/workspace/reviews/covert/` exists but contains **no** `covert*.md` boards yet.  
RELEASE-READINESS flags related work: “Stream ESC — raw SSE ANSI/OSC still forwarded; content sanitize incomplete” and open Race/Boundary cuts (mailbox/IPC).

`grz-src` is **ahead** of the session tree for control stripping (`stripControls` / `headerSafe` / handoff `safeReason`) but still does **not** cover zwsp/invisible Unicode or the other covert surfaces below.

---

## Cross-cutting: `timings` strip completeness

| Path | Behavior | Complete? |
|------|----------|-----------|
| Non-stream `proxyJson` | `sanitizeCompletionJson` deletes top-level `timings` | **partial** |
| Stream `proxyJson` | `canSanitize = !body?.stream` → raw pipe | **no** |
| Chat peek → assemble / non-stream deliver | sanitizes assembled JSON | **yes** (for peeked/assembled) |
| Chat peek → live SSE tail | peeked events sanitized; **remaining bytes piped raw** | **no** |
| `usage` token fields | **not** stripped on specialist completions | leak-adjacent |
| Nested / alternate timing keys | only `delete next.timings` | incomplete |

Citations: `src/proxy.mjs:23-47`, `src/proxy.mjs:68-84`; `src/handoff.mjs:108-115`, `src/handoff.mjs:314`, `src/handoff.mjs:321-328`; tests `test/proxy.test.mjs:65-88`, `test/gateway.test.mjs:122-136`.

**Patch sketch:** extend `sanitizeCompletionJson` to also drop `usage` (or zero it), strip known timing aliases; force all client-bound SSE through a transform that runs the same sanitizer per event (never raw-pipe upstream SSE). Add `sanitizeCompletionJson` coverage for stream in `proxyJson`.

**Test idea:** fake upstream SSE chunk containing `"timings":{...}` and assert client body never contains the key `timings` (and optional assert `usage` absent or identically zeroed).

---

## 1. Padding / timing quantization (HTTP response and/or inference latency buckets)

**Present?** **no**

**Key files + lines**
- Retry jitter only (not response quantization): `src/util.mjs:66-68`, used at `src/proxy.mjs:65`, `src/proxy.mjs:89`
- Response size = true payload: `src/proxy.mjs:75-80`, `src/handoff.mjs:294-297`, `src/handoff.mjs:336-340`, `src/util.mjs:79-86`
- Wall-clock / load exposure: `src/gateway.mjs:184-210` (`uptime_ms`, metrics queue/in_flight/resources)
- Cold-start health poll interval fixed 200 ms: `src/process-manager.mjs:251-267`

**What still leaks (description only)**
- **HTTP client:** end-to-end latency and `content-length` track real inference duration and answer size; streaming chunk arrival times track generation progress.
- **Other agent / local process:** concurrent load and cold-start duration remain observable via shared host CPU/RAM (`metrics` + OS tools).

**Defensive patch sketch**
- Add `quantizeLatency(startedAt, bucketMs)` in `util.mjs`; call from `proxyJson` / `deliverPeek` so response is held until the next bucket boundary (gateway-config: `response_latency_bucket_ms`).
- Optional: `padHttpBody(buffer, sizeClass)` to map JSON bodies into fixed size classes before `content-length` is set (non-stream only; for stream, emit fixed-rate keepalives with no semantic payload).
- Gate `/metrics` and trim `uptime_ms` granularity when API key / multi-tenant mode is on.

**Test idea**
- Fake fast upstream; assert two completions with different mock durations both finish on the same bucket grid (e.g. both `elapsed % bucketMs === 0` within tolerance) **without** asserting how an observer would encode bits—only that observed finish times fall on the configured grid.

---

## 2. Constant-size mailbox envelopes

**Present?** **no** (peek length cap is not an envelope)

**Key files + lines**
- Peek cap only: `src/constants.mjs:26` (`HANDOFF_PEEK_CHARS = 48`), used `src/handoff.mjs:142`, `src/handoff.mjs:201`
- Variable handoff notes into nexus: session `src/gateway.mjs:386-389`; grz-src sanitizes length/controls but not pad: `grz-src/gateway.mjs:390-414`, `grz-src/handoff.mjs:16-17`
- Session ledger variable records: `src/sessions.mjs:11-17`
- No mailbox / envelope / fixed-frame IPC module under `src/` or `grz-src/`

**What still leaks**
- **Other agent (nexus):** note and reason string lengths vary with specialist output.
- **HTTP client:** hop headers and final body length vary (`x-green-roomz-hops`, content length).
- **Local process:** no fixed-size IPC framing between gateway and backends (HTTP JSON of native length).

**Defensive patch sketch**
- Introduce `mailbox.mjs`: `sealEnvelope(payload, ENVELOPE_BYTES)` / `openEnvelope(buf)` — fixed-length frames for nexus notes, handoff reasons, and optional inter-agent messages (pad with zeros; reject oversize).
- Route `notes.push(...)` through `sealEnvelope` before `consultNexus` prompt assembly (`nexus.mjs` `buildNexusPrompt` / equivalent).
- Keep client HTTP separate: either omit note material from client responses (already mostly true) or pad client error bodies similarly.

**Test idea**
- `sealEnvelope` of short vs longer safe strings → identical `Buffer.byteLength`; `openEnvelope` recovers original logical payload. Assert oversize input throws `ValidationError` (no channel how-to).

---

## 3. No `cache_prompt` / KV residue across tenants/sessions

**Present?** **partial**

**Key files + lines**
- Single parallel slot default: `config/agents.windows.json:22` (`"--parallel", "1"`)
- `prepareInferenceBody` does **not** strip or force-disable cache fields — only `route_plan_only`, `lock_alias`, `session_id`: `src/gateway.mjs:78-92`
- Gateway sessions are metadata only (no llama slot reset): `src/sessions.mjs:3-52`, create/get in `src/gateway.mjs:226-227`, `271-275`
- Resident nexus stays loaded for process life: `src/process-manager.mjs:120-122`, README resident nexus note
- KV cache **types** tuned in profiles (`--cache-type-k/v`) but not cleared between clients: e.g. `config/agents.windows.json:87-89`

**What still leaks**
- **HTTP client / other tenant:** prompt-cache hits vs misses change latency (and possibly `usage`) when the same specialist process serves sequential sessions.
- **Other agent:** resident nexus KV can retain prior consult structure across turns.
- **Local process:** shared llama-server slots retain state until process stop.

**Defensive patch sketch**
- In `prepareInferenceBody(body, agent)`: force `cache_prompt: false` (and delete client-supplied `cache_prompt` / `slot_id` / related llama.cpp cache selectors).
- After each completed chat turn (or on `x-session-id` change), call a `clearSlot(agent)` helper — e.g. llama `/slots` reset or recycle process when `manifest.gateway.isolate_kv === true`.
- Document: `--parallel 1` alone is **not** multi-tenant KV isolation.

**Test idea**
- Unit-test `prepareInferenceBody` with `{ cache_prompt: true, slot_id: 1 }` → outgoing payload has `cache_prompt === false` and no `slot_id`. Integration fake: two sessions to same alias assert a `clearSlot` / reset hook was invoked between them.

---

## 4. Strip model-output of zwsp / tag / invisible Unicode

**Present?** **partial** (grz-src C0/C1 only; session tree weaker; content body largely unsanitized)

**Key files + lines**
- Session `util.mjs`: **no** `stripControls` (ends at `redact` / `jsonResponse`)
- grz-src C0/C1 only: `grz-src/util.mjs:79-86` — does **not** match U+200B–U+200F, U+FEFF, tag chars, etc.
- Handoff reason sanitizer (grz-src): `grz-src/handoff.mjs:16-21` — controls stripped from **handoff parse path**, not assistant `content`
- Assistant content delivered as-is: `src/handoff.mjs:94-115`, `src/handoff.mjs:300-306`; raw SSE forward `src/handoff.mjs:321-328`
- RELEASE-READINESS: stream ESC/ANSI/OSC still forwarded

**What still leaks**
- **HTTP client:** invisible code points and escape sequences in `choices[].message.content` / SSE deltas.
- **Other agent:** handoff/nexus text in session tree can carry controls; grz-src reduces C0/C1 in notes/headers only.
- **Local process:** logs via `redact` still keep zwsp in non-redacted text.

**Defensive patch sketch**
- Add `stripInvisibleUnicode(text)` in `util.mjs` (Cf/Zl/Zp + known zwsp/BOM/tag ranges; strip ANSI/OSC CSI sequences).
- Apply inside `sanitizeCompletionJson` to `message.content` and `delta.content` (and reasoning fields when kept).
- Port grz-src `stripControls`/`headerSafe` into session tree; widen regex beyond C0/C1.
- Never raw-pipe SSE; sanitize per event (ties to timings completeness).

**Test idea**
- Input completion whose content is `'ok\\u200b\\ufeff'`; after sanitize, assert equality to `'ok'` and that no code point in the Cf invisible set remains. Separate assert: ANSI color wrapper removed from content.

---

## 5. Refuse images/audio as opaque blobs without scanning policy

**Present?** **no** (modality routing only; no scan/refuse policy)

**Key files + lines**
- Presence detection only: `src/routing.mjs:4-21`, hard route `src/routing.mjs:82-86`
- Body size cap only: `config/agents.windows.json:9` (`request_body_limit_bytes`), enforced `src/gateway.mjs:166`
- Capabilities accept image/audio: e.g. vision/audio agents `config/agents.windows.json:50-65`; nexus accepts all three `config/agents.windows.json:153`
- Log redaction of data-URLs (not a scanner): `src/util.mjs:71-76`
- Policies are model system prompts, not gateway scanners: `policies/vision-layout.md`, `policies/audio-transcription.md`

**What still leaks**
- **Specialist / local process:** arbitrary base64/image/audio bytes forwarded once routed—no magic-byte, MIME, dimension, duration, or malware/policy scan at the gateway.
- **HTTP client:** error vs success timing can still reflect backend parse failures on hostile blobs.

**Defensive patch sketch**
- Add `mediaPolicy.mjs`: `inspectMediaParts(body) → { allow, reason }` — require declared MIME, decode bounded prefix, match magic bytes to declared type, enforce max pixels / max audio seconds / allowlisted codecs.
- Call from `Gateway.handleInference` **before** `hardRuleRoute` / `ensure`; on failure return 415/422 `media_policy_rejected` without starting a specialist.
- Config knobs under `manifest.gateway.media_policy` (allowlist, max bytes already exist as body limit).

**Test idea**
- Request with `type: image_url` but `data:application/octet-stream;base64,...` (or truncated/non-image magic) → assert 415/422 and assert `processes.ensure` was **not** called. Valid tiny PNG fixture → allowed (safe behavior only).

---

## 6. Isolate agents on disjoint CPU sets

**Present?** **partial**

**Key files + lines**
- Soft reservation via thread counts: `src/process-manager.mjs:10-17`, `20-27`; nexus profile `--threads 2` `config/agents.windows.json:158-159`; vulkan-all rewritten to `logical-2` threads
- Priority only (no affinity): `src/hosts/windows.mjs:40-46` (`PRIORITY_BELOW_NORMAL`), applied `src/process-manager.mjs:228`
- Android adapter has **no** CPU isolation hooks: `src/hosts/android.mjs`
- Policy can run unlimited heavy concurrency: `src/constants.mjs:14-17` (`maximize`)

**What still leaks**
- **Other agent / local process:** overlapping cores allow cross-process timing/contention observation; priority below-normal does not partition CPUs.
- **HTTP client:** indirect latency coupling when another agent is busy on shared cores.

**Defensive patch sketch**
- Extend host adapters: `WindowsHostAdapter.applyAffinity(child, cpuSet)` via process affinity API; Linux path `taskset`/`sched_setaffinity` when present.
- Manifest per-agent `cpu_set: [0,1]` / nexus `cpu_set: [6,7]`; `ProcessManager.startProfile` applies after spawn.
- Prefer `balanced`/`responsive` defaults when multi-tenant; document that `maximize` weakens isolation.

**Test idea**
- Fake spawn records `applyAffinity` calls; starting nexus + specialist asserts disjoint sets from manifest. Unit-test `vulkanAllThreadCount(8) === 6` remains, plus new `assertDisjoint(cpuA, cpuB)`.

---

## 7. Poll-0 idle (no informative idle timing)

**Present?** **no**

**Key files + lines**
- llama `base_args` lack `--poll`: `config/agents.windows.json:22`
- Agent profiles lack `--poll 0`: e.g. `config/agents.windows.json:87-89`, `158-159`
- Gateway idle is event-driven Node HTTP (OK) but backends may busy-poll by engine default
- Health wait loop sleeps 200 ms only during cold start: `src/process-manager.mjs:267` (not request-idle equalization)

**What still leaks**
- **Local process / other agent:** backend idle CPU spin vs sleep is observable; activity of one tenant can change idle wake behavior seen by another on the same host.
- **HTTP client:** if idle mode affects first-token latency after quiet periods, inter-request timing remains informative (ties to item 1).

**Defensive patch sketch**
- Append `"--poll", "0"` to `runtimes.llama_server.base_args` (and whisper if supported) so idle waits are non-spinning.
- Optionally add gateway `idle_equalize_ms` before starting inference when prior gap exceeded a threshold (coarse; combine with latency buckets).
- Mirror in `ProcessManager.buildLaunch` as a hard default if manifest omits it.

**Test idea**
- `buildLaunch` / manifest expand test: every llama agent argv includes `--poll` `0`. No timing channel test—only config assertion.

---

## Prioritized fix order

| Priority | Item | Rationale |
|----------|------|-----------|
| **P0** | Completeness of `timings` (+ stream sanitize) + **#4** invisible/ESC strip in `sanitizeCompletionJson` | Partial defense already claimed; stream raw-pipe and content channels are client-visible now. Aligns with RELEASE-READINESS “Stream ESC”. |
| **P1** | **#3** force `cache_prompt: false` + session/slot reset hook | Multi-session specialist reuse is the default architecture; one-line body rewrite is cheap, high leverage. |
| **P2** | **#1** latency buckets (+ optional size classes) | Closes direct HTTP timing/length oracle without needing host privileges. |
| **P3** | **#5** media scan/refuse policy | Stops opaque blob pass-through before specialist start; security-boundary overlap. |
| **P4** | **#2** constant-size mailbox envelopes | Needed once nexus notes / IPC are treated as cross-agent surfaces (Race board). |
| **P5** | **#6** disjoint CPU sets + **#7** `--poll 0` | Host-level isolation; apply with manifest defaults on Windows/Linux adapters. |

**Suggested landing sequence (defensive only)**  
1. Port `grz-src` `stripControls`/`headerSafe`/`safeReason` into session tree, then widen to invisible Unicode + SSE transform.  
2. Harden `sanitizeCompletionJson` + ban raw SSE pipe.  
3. `prepareInferenceBody` cache/slot lockdown.  
4. Latency bucket helper on non-stream completions.  
5. Media policy gate.  
6. Mailbox envelopes for nexus notes.  
7. Affinity + `--poll 0` in manifest/`buildLaunch`.

---

## Inventory snapshot

| # | Defense | Present? |
|---|---------|----------|
| 1 | Padding / timing quantization | **no** |
| 2 | Constant-size mailbox envelopes | **no** |
| 3 | No cache_prompt / KV residue | **partial** |
| 4 | Strip zwsp / tag / invisible Unicode | **partial** |
| 5 | Refuse unscanned image/audio blobs | **no** |
| 6 | Disjoint CPU sets | **partial** |
| 7 | Poll-0 idle | **no** |
| — | `timings` strip completeness | **partial** (non-stream only; stream/raw tail leak) |


---

## Addendum — Reviewer extras (2026-09-12)

Synced from Covert Channel Reviewer beyond the original seven defenses. Leak descriptions only.

### 8. Redact child-log tails in UnavailableError
**Present?** **no**
**Key files:** `src/process-manager.mjs:229-247`
**Leaks:** llama slot timing / tok/s from ring buffer → HTTP client (error body) + local process
**Patch sketch:** `redactChildLogTail(text)` — strip timing lines, tok/s, prompt-looking spans; never append raw last-2k to client-facing errors (keep internal debug behind env flag).
**Test:** fake log ring containing `slot print_timing` / `tokens per second` → `UnavailableError.message` has neither substring.

### 9. Constant-time API-key compare
**Present?** **no** (length short-circuit)
**Key files:** `src/util.mjs:49-52` (`secureEquals`)
**Leaks:** key length oracle → HTTP client
**Patch sketch:** always hash both sides to fixed-length digests (or pad to max) then `timingSafeEqual`; never early-return on `a.length !== b.length` for secrets.
**Test:** equal-length mismatch vs unequal-length both call through timing-safe path (spy/`timingSafeEqual` invoked); no assertion of wall-clock deltas.

### 10. Scrub paths from health / models / props / error details
**Present?** **no**
**Key files:** `src/gateway.mjs:174-178`; registry via `/health`, `/v1/models`, `/props` (`registry.mjs` unavailable_reasons)
**Leaks:** missing model/runtime filesystem paths → HTTP client
**Patch sketch:** `sanitizePublicError(details)` / `publicUnavailableReason(reason)` — map to stable codes (`model_missing`, `runtime_missing`); drop absolute paths; apply to error JSON and registry public views.
**Test:** force missing artifact → client body has no `C:\` / `/` path fragments; has stable reason code.

### 11. Session-tree `headerSafe` on hop headers
**Present?** **partial** (grz-src only)
**Key files:** `src/gateway.mjs:213-221`, `:395-397`; grz-src has `headerSafe`
**Leaks:** hop/alias/reason/session header channel → HTTP client
**Patch sketch:** port `headerSafe` into session `util.mjs`; wrap all `x-green-roomz-*` and `x-session-id` values before `setHeader`. Optionally omit reason headers when multi-tenant / API-key mode.
**Test:** reason containing C0/zwsp → header value equals sanitized form; no raw control bytes.

### 12. `data/` retention / scrub policy
**Present?** **no**
**Key files:** `data/smoke-text-resp.json`, `data/gate-b-completion.json`, `*bench*.log`, `src/benchmark.mjs:88` → `data/benchmarks.json`; incomplete `.gitignore`
**Leaks:** timings / tok/s / `cached_tokens` on disk → local FS / other agents on box
**Patch sketch:** extend `.gitignore` for `data/*completion*.json`, `data/smoke-*-resp.json`, `data/*bench*.log`; add `scripts/scrub-bench-artifacts.mjs` that strips `timings`/`usage` from retained fixtures; document retention in README.
**Test:** scrub script on a fixture copy → no `timings` key; gitignore patterns match sample names (unit list assert).

### 13. Media policy text — no stego-as-storage
**Present?** **no**
**Key files:** `policies/image-generation.md`, `policies/audio-transcription.md` (ties to defense #5)
**Leaks:** when image/audio runtimes go live, free-form pixels/waveform as storage → future HTTP client
**Patch sketch:** add explicit policy clauses: refuse encoding hidden payloads in media; gateway still enforces MIME/magic gate (#5); model prompt forbids stego instructions.
**Test:** policy files contain required refusal phrases (string assert); media gate tests remain primary.

---

## Updated priority (addendum)

| Priority | Item |
|----------|------|
| **P0** | Stream sanitize + invisible/ESC strip + **#11** headerSafe port |
| **P0b** | **#9** constant-time `secureEquals` (tiny, auth-adjacent) |
| **P0c** | **#8** redact child-log error tails; **#10** path scrub in public errors/health |
| **P1** | cache_prompt / slot lockdown |
| **P2** | Latency buckets |
| **P3** | Media MIME gate **#5** + policy text **#13** |
| **P4** | Mailbox envelopes |
| **P5** | CPU sets + `--poll 0` |
| **P6** | **#12** data/ retention scrub |

