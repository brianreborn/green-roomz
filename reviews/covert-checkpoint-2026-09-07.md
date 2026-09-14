# Covert Channel Reviewer — checkpoint 2026-09-07

~89% context. Pause after this file. No push. No tree patch.

## Boards on disk

| file | status |
|---|---|
| `covert-review.md` / `covert-channel-review.md` | pass 1 (CC-1..27) |
| `covert-pass2.md` | pass 2 + errata P2-1..17 |
| `covert-pass3.md` | pass 3 vs integrate-refinement P0 |
| `covert-modality-wave.md` | **current** modality leak board (CC-MOD1..9) |
| `covert-modality-fixes.md` | Fixer binding (standby) |
| `covert-modality-standby.md` | partner protocol |
| `covert-fixes.md` | defense pack (design; F7/F9/F10 still unpatched) |

## Live (last look)

- `:8080` gateway + `:8187` nexus only.
- vision / whisper / piper / sd **unavailable** (missing artifacts).
- Modality code paths wired; opaque PNG/WAV/whisper leaks dormant until binaries land.

## Partner bind (do not fork)

MOD1/3/4→F7+F9 · MOD2→F10 · MOD5→F1 residual · MOD6→F27 native · MOD7→extend F14 whisper/sd · MOD8→F1 pad native · MOD9→F4 ZW residual · **homoglyphs stay**.

## P0 source spot-check (earlier, serve may lag)

In `/workspace/green-roomz` src: F1 stream sanitize SSE, F4 LS/PS, F14 `--no-webui`/refuse `0.0.0.0` (llama), RF9 GET-only+HEAD bodyless+`requestTimeout` 180s, F27 publish-after for llama hops. Native/TTS still MOD gaps. Full pass4 board **not** written (interrupted).

## Next (after resume / models)

1. When modality models land: delta re-flag only under `/workspace/reviews/`; ping Fixer.
2. Optional: finish `covert-pass4.md` vs bounced serve if Researcher asks.
3. Do not invent leaks Fixer/Researcher did not scope.

Paused.
