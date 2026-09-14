# Covert modality defenses (dormant) — bind to CC-MOD1..9

Date: 2026-09-06 ~11:33 PM PT. Source: `/workspace/reviews/covert-modality-wave.md`.
**Do not reinvent.** Maps onto existing F-pack. Tree: F7/F9/F10 still absent (P1). No PoCs. No push.

Live modality binaries still missing — patches stay design-only until Reviewer re-flags deltas.

---

## Bind table

| ID | Sev | Bind | Defense (padding / timing / sanitize) |
|---|---|---|---|
| CC-MOD1 image-gen PNG store | H | **F7 + F9** | `scanMedia` on outbound PNG before wrap; `sanitizeCompletionJson` on native wrap; constant-size frame or refuse oversized b64 (pad/`content-length` quantize via F1 `padFrame` on JSON envelope, not inventing stego) |
| CC-MOD2 TTS WAV + transcript | H | **F10** | scan WAV; `mkdtemp` 0700; omit `transcript`; F1 pad/hold after `release` on that hop |
| CC-MOD3 whisper text/alignment | M | **F9** (+ F4) | `stripEscapes` on `.text` only; never stringify full whisper JSON; missing `.text` → 502 empty content |
| CC-MOD4 native skip sanitize | M | **F9** | all `completeNativeChat` / TTS / embed / rerank through `sanitizeCompletionJson` |
| CC-MOD5 vision llama usage/slots | M when live | **F1 residual** + **F14** (llama) | delete proxied `usage` (F17 / stitch P2) or zero; stream already no `timings`; vision port inherits F14 `/slots` gate |
| CC-MOD6 native success-before-status | M | **F27 residual** | `observeHop('success')` only if `upstream.status < 400`; else `agent_unavailable` |
| CC-MOD7 whisper/sd bind | L–M when live | **extend F14** | `hostBindsPublic` refuse + no debug metrics on whisper/sd `buildLaunch` branches (same as llama) |
| CC-MOD8 unpadded native size/TTFB | L–M | **F1 + F7/F10** | after PolicyGate `release`, `holdMs`; JSON envelope `padFrame` / bucketed `content-length` for native/TTS bodies |
| CC-MOD9 vision OCR ZW carrier | M when live | **F4 residual** | land full ZW/bidi/TAG strip from Fixer F4 design in `stripEscapes` (LS/PS already in); **homoglyphs stay** — no fold |

---

## Apply order (when binaries + P1 open)

1. **F4 residual** — ZW/bidi/TAG into `stripEscapes` / `stripControls` (homoglyphs stay). Unblocks MOD9 + helps MOD3/4.
2. **F7** `media-scan.mjs` — magic/size/no trailing bytes for PNG/WAV (and vision inbound when present).
3. **F9** — `completeNativeChat` sanitize + whisper `.text` only.
4. **F10** — TTS scan, no transcript echo, 0700 tmp.
5. **F14 extend** — whisper/sd public-bind refuse (MOD7).
6. **F27 residual** — native hop publish after status (MOD6).
7. **F1 residual** — `holdMs` after release on native/TTS paths; optional `padFrame` on native JSON; delete/`zero` vision `usage` when live (MOD5/MOD8).

Tests: constants, stripping, refusals, magic mismatch → 400. No encoders. No recovery checks.

---

## Explicit non-goals

- Homoglyph decoder / confusable fold (Reviewer + stitch: stay).
- Stego PoCs, encode/decode, timing attack procedures.
- Patching `src/` this turn; git push.
- Inventing leaks beyond MOD1–9.

## Standby

`/workspace/reviews/covert-modality-standby.md` — wait for Reviewer delta re-flag after models land. This file is the bind; do not duplicate attack narrative from the wave board.
