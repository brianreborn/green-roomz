# Qodesh bounce notes — P0 #1 FUZZ-FALLTHROUGH (box path)

**Status:** WAITING on `DISPATCH-FIX-01-fallthrough-2026-09-12.md` board + parent patch in `/workspace/grz-src`  
**Host:** qodesh `19f2c19e-e100-49f0-8507-813d66727973` (connected)  
**Rule:** no push · no Cloud Agent · never GGUF on 8600 GT · CPU nexus only · don’t kill :8765 if present · McAfee-safe short PowerShell

## Pre-conditions

- [ ] `DISPATCH-FIX-01-fallthrough-2026-09-12.md` board dropped under `/workspace/reviews/release/`
- [ ] Release Driver reviewed `/workspace/grz-src` diff (files listed on that board)
- [ ] Box `node --test` still green on session tree after absorb (if session also patched)
- [ ] Operator / New Bot greenlight to bounce live qodesh

## Paths (qodesh)

| What | Path |
|------|------|
| Live tree | `C:\Users\brian\Documents\green-roomz` |
| Node | `C:\Program Files\nodejs\node.exe` (v24.19.0) |
| Patch source | box `/workspace/grz-src/*.mjs` → qodesh `src\` (only files named in DISPATCH-FIX-01) |
| Gateway | `http://127.0.0.1:8080` |
| Nexus | `:8187` CPU `--device none` (0.5B) |
| Thinking log | `C:\LocalAI\thinking.log` — one watcher only; do not spawn more |

## Bounce sequence (after review)

1. **Copy** only the patched modules from box → qodesh `Documents\green-roomz\src\` (prefer CopyFromBox / approved machine Shell; do not overwrite whole tree blindly).
2. **Stop** green-roomz serve on qodesh via project script if present (`scripts\stop-green-roomz.ps1` / SIGINT to the serve node). Do **not** `Stop-Process node` casually (McAfee). Do **not** leave stray llama-server.
3. **Start** `node bin\green-roomz.mjs serve` (or `scripts\start-green-roomz.cmd`) from the live tree cwd.
4. **Health:** `GET http://127.0.0.1:8080/health` → expect 200 (may be `degraded` without 4B — OK). Nexus resident.
5. **Fallthrough gate (defensive):**
   - `POST /v1/chat/completions` `model: code-agent` → **not** 200 with `eff=tool-router-agent`; expect **400/404/503** per DISPATCH-FIX-01 policy.
   - Same for `speech-synthesis-agent`, `general-text-agent`.
   - Contrast: valid `general-text-speculator` or slash `/text` still works (or clean unavailable).
6. **Regression spot:** lockdown/reboot still **404/501 reject** (never 200 success); `/health` still up.
7. **Log:** append results to `/workspace/reviews/release/` bounce log + update `RELEASE-READINESS.md` P0 row.

## Do not

- Install CUDA / put GGUF on 8600 GT VRAM
- `git push` / merge
- Bounce shalom from this note (other-team / offline path)
- Re-download models or llama zip
- Touch note9 files (client track)

## Rollback

Keep pre-copy copies of replaced `src\*.mjs` under `C:\Users\brian\Documents\green-roomz\_bounce-backup-YYYYMMDD\` before overwrite; restore + bounce if health or fallthrough gate fails.
