# Platform Reviewer — checkpoint (pause)

Date: 2026-09-07 ~PT. Trigger: Researcher CHECKPOINT NOW (~89% usage). **Paused.** No further audit/patch this turn.

## Closed cuts

| Cut | Artifacts | State |
|---|---|---|
| PF1–PF9 (path/signal/l10n next-cut) | `platform-review.md`, `platform-pass2.md`, `platform-fixes.md`, `pf-apply-notes.md`, `platform-pass4.md` | **Applied + committed** (was `efa7e2b`; tree tip now `85c2c3c` monitor fix). Live `:8080`/`:8187` **not** bounced onto PF (P0 overlay). No `stop.sh`. |
| B14 `${}` | PF2 owns allowlist + fail-closed | Single impl for now (Researcher ack) |

## Open cut — missing-model fill (paths)

| Artifact | State |
|---|---|
| `platform-models.md` | Board + addenda (LocalAI/Termux scan + full inventory). PLAT-M1…M15 |
| `platform-models-fixes.md` | PF-M1…M10 pack submitted to Researcher — **not applied** |

### Top residuals (do not lose)

1. **PF-M1 / cursor bind:** cursor still names `missing-qwen-instruct.gguf`; Instruct bytes exist; this box has a **hardlink** (same inode) so local cursor works — pack/Win must not rely on hardlinks; prefer real HF basename in manifest.
2. **LocalAI:** `agents.windows.json` + README default language + pull/copy scripts — do not use as qodesh/MVP fill target.
3. **`${GRZ_EXE}`** missing on whisper/piper/sd stubs.
4. **Termux:** no `$HOME/grz-runtime/missing/` mkdir; deploy/termux copy nexus-only; never final under `/data/local/tmp`.
5. **NEW:** `${HOME}` empty-collapse → `/grz-runtime/…` not fail-closed (PF-M8).
6. **NEW:** Instruct casefold pair risk; piper one-shot only.

### On disk (this tree)

- Nexus + Instruct GGUFs present; `missing-qwen-instruct.gguf` ≡ Instruct (hardlink).
- No whisper/piper/sd binaries.
- Live ports still up; leave alone.

## Explicitly not doing

- Tree patch, git push, `stop.sh`, serve bounce, multi-GB fetches, Knox/API-key, exploit PoCs.

## Resume cue

When usage recovers / Researcher asks: apply or re-cite PF-M pack; optional pass on README LocalAI default after fill starts.

## Researcher ack (checkpoint window)

- PLAT-M / PF-M noted; integrate when fill resumes.
- Note9 USB unauthorized on qodesh — operator Allow pending (not platform action).
- Still paused.
