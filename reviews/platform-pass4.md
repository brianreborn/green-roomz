# Green-Roomz platform pass 4 (PF apply fold)

Date: 2026-09-06 ~05:15 PT. Cite board after Researcher applied PF1–PF9 on `/workspace/green-roomz` (158 tests, unstaged). Sources: `/workspace/reviews/pf-apply-notes.md`, `/workspace/reviews/integrate-refinement.md`, `/workspace/reviews/platform-fixes.md`, live spot-check (no `stop.sh`).

Tree frozen for commit by Researcher. Live serve **not** bounced onto this tree (`:8080` node, `:8187` llama still the pre-PF process). `data/serve.pid` absent → CLI `stop` is a safe fail-closed no-op.

---

## Verdict

| ID | Pass-4 |
|---|---|
| **PF1** | **Landed.** Pidfile + children.json; CLI stop exit 1 without pidfile (spot-checked); pack `stop.sh`/`stop.cmd` in git root; ports 8080+8181–8187; no `/IM llama-server.exe`; no `xargs -r`. |
| **PF2** | **Landed (and owns B14 hole).** Allowlist + `Object.hasOwn` + fail-closed collapsed `/runtime/llama-server` were **not** on tree after recorded P0; PF2 implemented them. Coordinate if a later B14 duplicates. |
| **PF3** | **Landed.** `DEFAULT_MANIFEST` → `agents.cursor.json`; package start passes it; cursor json portable `${GRZ_ROOT}`/`${GRZ_LLAMA}`. |
| **PF4** | **Landed.** OS detect before chmod; refuse Linux ELF on BSD/Darwin; `GRZ_LLAMA`; merge loader paths; spawn cwd. |
| **PF5** | **Landed.** note9/android under `${HOME}/grz-runtime`; no `/data/local/tmp` for command/resident model; wrap shebang env bash. |
| **PF6** | **Landed.** LocalAI vulkan fallback removed from `start.cmd`; curl/node fail-closed; robocopy XF ELF/`*.so`. |
| **PF7** | **Landed.** SIGHUP drain; default `canSuspend` false (`suspend_evicted === true` opt-in); TCP `waitForPortsFree` fail-closed. |
| **PF8** | **Landed.** 0.5B only on `tool-router-agent` + `languages:['en']`; code/text → `missing-qwen-instruct.gguf`; translate line narrowed; BOM/NFC/bidi/`chcp`. |
| **PF9** | **Landed.** gitattributes eol; bin 755; cursor-serve env bash. |

Spot-check 2026-09-06: `node bin/green-roomz.mjs stop` → `{ok:false,error:"no serve pidfile"}` exit 1; live `:8080`/`:8187` unchanged. Cursor validate ok with code/text degraded on missing instruct GGUF.

---

## Integrate-refinement deltas that still matter

- **Security P0** (RF1–RF3, fuzz HTTP shape, F4, F14, reject envelopes) assumed already on tree; this cut did not re-run that suite as platform-primary.
- **B14 / F-B14:** integrate listed `${}` allowlist as P1 / “not this cut” for platform remainder. Apply notes: hole still open after P0 → **PF2 closed it**. Prefer single implementation going forward.
- **RF4:** platform did **not** fork full `stopRecord` exit-after-SIGKILL; only PF7 TCP port-busy fail-closed. Full RF4 exit-wait still race-owned if not already in P0 process-manager.
- **F-B1:** still P2; no bearer mint in start.sh (correct).
- **Live lock:** do not `./stop.sh` against the current e2e gateway to “prove” PF1 — it would reap 8080/8181–8187 on whatever holds those ports (including the old live serve).

---

## Residual / next

1. **Bounce serve** onto the new tree when operator wants PF live (new pidfile). Not this turn.
2. **Ship a Qwen-tokenizer instruct GGUF** for general-text/code (pack currently `missing-qwen-instruct.gguf` by design). 0.5B Tekken stays nexus-only.
3. **Commit** when Researcher is ready (notes say unstaged).
4. **Hardware proof** FreeBSD/Darwin/Note9/qodesh still out of scope on this Linux box.
5. If RF4 exit-after-SIGKILL is still open in process-manager, that is race residual, not a new platform PF.

---

## Do not

- Run pack `stop.sh` against live `:8080`/`:8187` while proving PF1.
- Re-open LocalAI vulkan fallback or bind 0.5B to general-text/code.
- Add translation-agent / API-key product / Knox / homoglyph fold.
- Patch further without a new cut ask.

---

## Pass-4 status

PF1–PF9 accepted as applied per `pf-apply-notes.md` + spot-check. Cite board only; no tree patch this turn. Waiting on Researcher commit + optional serve bounce.


## Commit

Landed locally as `efa7e2b` on `host/cursor` (2026-09-06). Push blocked (gh not logged in on this box). Live `:8080` remains P0 overlay — no PF bounce requested by Platform Reviewer. B14: PF2 is the single `${}` impl for now. Researcher packing beta-0.4.
