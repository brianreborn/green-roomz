# Covert Channel Fixer — checkpoint

Date: 2026-09-06 11:36 PM PT. Usage cue: ~89%. **Paused** after this board. No push. No tree patch this turn.

## Role

Defense partner to Covert Channel Reviewer. Padding / timing / sanitize / constant-size. No exploit how-to, no PoCs.

## Boards (authoritative)

| File | What |
|---|---|
| `covert-fixes.md` | Full F-pack (pass 1–3). P0 applied on tree 2026-09-03. |
| `covert-pass2.md` / `covert-pass3.md` | Finder + integrate-refinement binds |
| `integrate-refinement.md` | Stitch: F1 after PolicyGate release; nexus stays 4; F13 refs=0+slot idle; F22 ok:false on drop; F14 gate `/slots`; homoglyphs stay |
| `covert-modality-wave.md` | Reviewer CC-MOD1..9 (dormant — no modality binaries) |
| `covert-modality-fixes.md` | Fixer bind MOD→F (this session) |
| `covert-modality-standby.md` | Wait for post-model delta re-flag |

## P0 landed (verified earlier on tree)

- **F1:** `holdMs` after `release()` in gateway; stream sanitize / no client `timings`
- **F5:** `cpu-set.mjs`; nexus 4; empty set = no spawn; refuse oversubscribe
- **F13:** `restoreModel` gated on `refs==0` + `slotIsIdle`
- **F22:** logger returns ok:false, dropped:true on missing path / flood / write fail
- **F14:** llama `--no-webui`, strip `--metrics`, refuse `0.0.0.0`; `/slots` via process-manager only
- **F26:** non-array `messages` → 400 `validation_error`
- **F4 partial:** U+2028/U+2029 in strip; **full ZW/bidi still open** (MOD9)
- Homoglyphs **not** folded

## Still P1 / dormant (do not reinvent)

- **F7 / F9 / F10** — `media-scan.mjs` absent; native/TTS sanitize absent → closes MOD1–4 when opened
- **F14 extend** — whisper/sd bind refuse (MOD7)
- **F27 residual** — native `observeHop('success')` before status (MOD6)
- **F1 residual** — native body pad / vision `usage` (MOD5/8)
- **F4 residual** — ZW beyond LS/PS (MOD9); homoglyphs stay

## Live / models

- Nexus GGUF only (`Qwenstral-Small-3.1-0.5B`). Vision/whisper/piper/sd artifacts **missing**.
- Modality ports not listening. Wave board dormant until binaries land; Reviewer will re-flag deltas only.

## This session

1. Researcher: partner for post-model modality defenses → standby board.
2. Reviewer: pointed at `covert-modality-wave.md` MOD1..9 map.
3. Wrote `covert-modality-fixes.md` bind table; updated standby; pinged Reviewer + Researcher.

## Next wake

1. If Reviewer drops post-model deltas under `/workspace/reviews/` → extend modality-fixes (padding/timing/sanitize only).
2. If Researcher opens P1 F7/F9/F10 apply → follow integrate order; still no PoCs / no push unless told.
3. Do not fork away from `integrate-refinement.md` / modality bind table.

## Explicit non-goals

PoCs, stego recipes, homoglyph decoder, git push, inventing leaks Reviewer did not flag, stopping live serve to prove platform leftovers.
