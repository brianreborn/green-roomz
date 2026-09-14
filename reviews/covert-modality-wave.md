# Green-Roomz covert review — modality wave (whisper / piper / sd / vision)

Leak report only. No recipes, no PoCs, no encode/decode, no timing procedures. No git push.

Date: 2026-09-06 ~11:32 PM PT.
Tree: `/workspace/green-roomz` (P0 security cut applied earlier; F7/F9/F10 media-scan **not** in this tree).
Live: gateway `:8080` + nexus `:8187` only. All modality agents **`unavailable`** (missing runtimes/models: `missing-whisper-server`, `missing-piper`, `missing-sd.gguf`, `missing-vision.gguf`, `missing-voice.onnx`). Code paths are wired; live dumps of opaque bodies are dormant until binaries land.

Prior IDs: CC-3 / CC-4 / CC-22 / CC-23 still open (refinement parked F7/F9/F10 as P1).

---

## Wiring map

| alias | runtime | port | path | gateway entry | live |
|---|---|---|---|---|---|
| `vision-layout-agent` | `llama_server` (+ mmproj when present) | 8181 | `/v1/chat/completions` (peek/proxy) | not in `NATIVE_CHAT` | unavailable |
| `audio-transcription-agent` | `whisper` | 8182 | `/inference` | `NATIVE_CHAT` → `completeNativeChat` | unavailable |
| `speech-synthesis-agent` | `piper` | 8189 | one-shot `execFile` | `completeSpeech` (slash `/tts`) | unavailable |
| `image-generation-agent` | `stable_diffusion` | 8190 | `/v1/images/generations` | `NATIVE_CHAT` → `completeNativeChat` | unavailable |

`process-manager` whisper/sd launch: port + model + profile args. Piper `ensure` throws “no persistent server”. Vision is llama with optional `--image-max-tokens` / `--mmproj`.

---

## Findings

### CC-MOD1: Image-gen body is an unsanitized PNG store (high) — was CC-3
- file: `src/gateway.mjs:247-266` (`response_format: 'b64_json'`), `:221-244` (`wrapNativeAsChat` image → `data:image/png;base64,...` or multipart `image_url`), `:578-621` (`completeNativeChat` → `jsonResponse`, **no** `sanitizeCompletionJson`)
- leaks: opaque PNG bytes in the chat completion body; unpadded `content-length` = real JSON size. Policy `image-generation.md` has no scan SHALL.
- to: HTTP client of that turn (and any proxy/log of the body)
- wired?: yes (code); dormant live (missing sd binary/model)
- notes: no `media-scan.mjs` on disk; F7/F9 still P1 in integrate-refinement.

### CC-MOD2: TTS WAV + transcript echo (high) — was CC-4
- file: `src/gateway.mjs:624-659` (`completeSpeech`)
- leaks: Piper writes `speech.wav` under `os.tmpdir()/grz-tts-*` (deleted in `finally`); response `audio.data` is raw WAV b64; `transcript` echoes the input text; usage zeros (not a tok channel). Unpadded body size.
- to: HTTP client; anyone who can read the temp file before `rm`
- wired?: yes (one-shot); dormant live (missing piper/voice)
- notes: F10 not applied. Persistent piper server still refused in `process-manager.mjs:499-500`.

### CC-MOD3: Whisper transcript / alignment not escape-stripped (medium) — was CC-22
- file: `src/gateway.mjs:257-260`, `:281-289`, `:221-224`, `:232`
- leaks: inbound `data:audio/...;base64` decoded and POSTed as multipart `file` to whisper. Happy path: `.text.trim()` only (no `stripEscapes`). Missing `.text`: whole upstream JSON (alignment / timing metadata if whisper emits it) stringified into `content`.
- to: whisper-server process; HTTP client of the transcription
- wired?: yes; dormant live
- notes: gateway does not persist the audio file. Whisper JSON may include segment timings — those would reach the client on the missing-`.text` path.

### CC-MOD4: Native wrappers skip `sanitizeCompletionJson` (medium) — was CC-23
- file: `src/gateway.mjs:610-621`, `:648-659`; embeddings/rerank same `wrapNativeAsChat`
- leaks: no `stripEscapes` on whisper/image/embeddings/rerank/TTS content. ZW / homoglyphs / trailing space in whisper text or SD metadata strings survive. Usage hardcoded zeros on these wrappers (negative for tok/s).
- to: HTTP client
- notes: vision (llama) uses `proxyJson` / peek — stream/non-stream sanitize from P0 F1 applies there, not here.

### CC-MOD5: Vision tok/s / timings via llama path (medium when live)
- file: vision is `llama_server` (`config/agents.cursor.json:70-89`); hops use `proxyJson` / `peekSpecialist` / `deliverPeek`
- leaks: after P0, client streams should have **no** `timings` (`writeSanitizedSse`). Non-stream deletes `timings`. Residual: proxied `usage` token counts (prompt/completion size, incl. image-token inflation if llama reports them); unpadded SSE chunk cadence on peek deliver; loopback `:8181/slots` if a vision llama is up (F14 `--no-webui` / strip `--metrics` / refuse `0.0.0.0` apply on **llama** branch only).
- to: HTTP client; loopback process on vision port
- wired?: code yes; dormant live (missing vision GGUF)
- notes: `--image-max-tokens` caps cost (`process-manager.mjs:457-460`) — not a covert fix, just a size bound.

### CC-MOD6: Native hop still `success` before status check (medium)
- file: `src/gateway.mjs:608-613`
- leaks: `observeHop('success')` always runs after parse, even when `upstream.status >= 400` is returned to the client. Monitor dump can show success for a failed native turn.
- to: HTTP client of `/v1/monitor/recent` (tickets hashed post-P0)
- notes: llama resident/direct/fallback paths publish after `proxyJson` status (F27). Native/TTS still pre-ack.

### CC-MOD7: Whisper/SD bind + ready probes (low–medium when live)
- file: `src/process-manager.mjs:495-498`, `:18-19`; `hostBindsPublic` / `--no-webui` only inside `llama-server` branch (`:376-385` area)
- leaks: whisper/sd get port+model+`profile.args` with **no** public-bind refuse and no `--no-webui`. Ready probe is `GET /` anyAnswer (not `/health`). Opaque HTTP surfaces on those ports once binaries exist.
- to: loopback (shipped host); any peer if `extra_args`/`profile.args` set `--host 0.0.0.0`
- notes: F14 did not extend to whisper/sd. Piper has no long-lived port.

### CC-MOD8: Unpadded native `content-length` / wall time (low–medium)
- file: `src/util.mjs` `jsonResponse`; `completeNativeChat` / `completeSpeech` have no frame padding / no `holdMs` on those branches (holdMs sits after PolicyGate `release` on chat-turn / council / direct-alias)
- leaks: response byte size tracks PNG/WAV/transcript size; client-visible TTFB tracks upstream work when those routes are taken under a PolicyGate-acquired hop (direct native via chat-turn gets `holdMs` after release; the size channel remains).
- to: HTTP client
- notes: F1 quantize/pad was for SSE/JSON frames on proxy paths; native opaque bodies were F7/F10 territory.

### CC-MOD9: Vision OCR text as stego carrier (medium when live)
- file: `policies/vision-layout.md` (preserve visible spelling; exhaustive Markdown); vision completions go through llama sanitize (`stripEscapes` + LS/PS after F4) but **no** homoglyph fold
- leaks: model OCR output can carry ZW (if not stripped — F4 added LS/PS to `stripEscapes`; full ZW/bidi set was Fixer F4 design, check: current `stripEscapes` is C0/C1 + OSC/CSI + LS/PS only — **ZW U+200B etc. still pass**), homoglyphs, trailing space in “faithful OCR”
- to: HTTP client
- notes: homoglyph residual was explicit post-F4. Vision policy amplifies “preserve glyphs” as a store once the GGUF is live.

---

## Negatives

- Native wrappers zero `usage` (no tok/s field on whisper/sd/TTS JSON).
- P0 stream `timings` strip applies to vision when it uses `proxyJson` stream.
- Gateway does not write durable image/audio files (except TTS temp, then `rm`).
- Live serve: modality ports not listening; no live opaque dump to re-measure.
- Piper not a persistent server (no always-on TTS port).

---

## Relation to Fixer / refinement

| Fixer | Would close | Status in tree |
|---|---|---|
| F7 media-scan | CC-MOD1 inbound/outbound magic/size | **absent** (`media-scan.mjs` missing) |
| F9 native sanitize | CC-MOD3/4 | **absent** |
| F10 TTS scan; drop transcript; 0700 tmp | CC-MOD2 | **absent** |
| F4 full ZW/bidi | CC-MOD9 partial | only U+2028/U+2029 landed |
| F14 extend to whisper/sd | CC-MOD7 | llama-only |

---

## When binaries land (re-verify)

1. Confirm whisper/sd listen host and whether `/` or other debug routes expose timings.
2. One real `/image` and `/audio` / `/tts` turn: check response has no `timings`, whether `stripEscapes` ran, WAV/PNG still opaque, monitor hop kind on upstream 4xx.
3. Vision warm on `:8181`: `/slots` readability and `usage` with image parts.
4. Do **not** craft stego payloads; observe fields only.

No push. Ping Researcher when this file is on disk.
