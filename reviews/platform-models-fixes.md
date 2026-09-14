# Platform models-fill fix pack (PF-M)

Date: 2026-09-07. Apply after beta-0.4 packing coordination. **Submit to Researcher.** No push from Platform Reviewer. Do not bounce live serve unless operator asks.

Sources: `/workspace/reviews/platform-models.md`.

## Apply order

| ID | Invariant | Touch |
|---|---|---|
| **PF-M1** | One on-disk basename per artifact = upstream HF name. Update `agents.cursor.json` code+text from `missing-qwen-instruct.gguf` → `Qwen2.5-0.5B-Instruct-Q4_K_M.gguf` (or whatever fetch installs). Keep validate fail-closed if file absent. | `config/agents.cursor.json`, optionally windows-mvp code alias |
| **PF-M2** | Specialist commands use `${GRZ_EXE}`: `whisper-server${GRZ_EXE}`, `piper${GRZ_EXE}`, `sd-server${GRZ_EXE}` under `${GRZ_ROOT}/runtime/`. | cursor + windows-mvp manifests |
| **PF-M3** | Termux/note9: same basenames under `${HOME}/grz-runtime/models/`; retire opaque `missing/text.gguf` once filled (or map via thin wrappers). Extend `termux-start.sh` / `note9-termux-setup.sh` / `deploy-android.sh` to copy **all** `models/*` (and optional runtime bins) from staging → HOME, not only nexus. | note9/android manifests + launchers |
| **PF-M4** | Fetch family: generalize `fetch-tiny-instruct.cmd` pattern (curl fail-closed, `.partial`, min size) for whisper/piper/sd/vision — or one `scripts/fetch-models.cmd` + `.sh` driven by a table. Dest = `%GRZ_ROOT%\models` / `runtime`, **never** `C:\LocalAI`. | `scripts/` |
| **PF-M5** | Docs + operator banner: qodesh/beta fill uses LocalAppData / `GRZ_ROOT`; `agents.windows.json` = shalom LocalAI overlay only. Fix **README.md** (still says default=`agents.windows.json` + `C:\LocalAI`) and soften `docs/deployment.md`. Pack `start.cmd` already defaults windows-mvp. | README.md, docs (Researcher may own) |
| **PF-M6** | Vision fill = model + mmproj pair; manifest both or skip agent. | manifests + fetch table |
| **PF-M7** | Case-preserve; flat `models/`; quote all Win paths; Termux prefer `cp` over `ln -sf` when source is sdcard. | fetch + termux scripts |

## Shared / do not double

- PF2 `${}` allowlist / fail-closed — already landed; only consume `GRZ_EXE`/`GRZ_ROOT`/`HOME`.
- PF5 Termux HOME — extend copy list; do not reopen `/data/local/tmp` as final.
- PF6 / PF8 — no LocalAI vulkan revive; nexus 0.5B stays English JSON only.
- RF4 / stop ports — out of scope.

## Out of scope

- Actually downloading multi-GB weights on this box.
- CUDA 1.1 build for qodesh 8600 GT.
- API-key product / Knox.
- Git push (gh not logged in).

## Tests to add (Researcher / Release Driver)

- `expandEnvironment` + resolve: `whisper-server${GRZ_EXE}` → `.exe` on win32, bare on posix.
- validate: after stub→real rename, missing file still issues; present file clears.
- Optional: path-length unit with long username prefix (>200) rejects or warns.

## Status

Pack ready for Researcher integrate when operator starts the fill.

## Addendum 2

| ID | Invariant | Touch |
|---|---|---|
| **PF-M1b** | Cursor code+text → real `Qwen2.5-0.5B-Instruct-Q4_K_M.gguf` now that file is on disk (same as windows-mvp general-text). | `config/agents.cursor.json` |
| **PF-M8** | Fail-closed collapsed `${HOME}` → reject `/grz-runtime/` absolute junk; on win32 default `HOME` from `USERPROFILE` in `withDefaultGrzEnv` if unset. | `src/config.mjs` |
| **PF-M9** | Document single Instruct basename (bartowski PascalCase); refuse installing both casefold variants into same Win `models\`. | fetch + docs |
| **PF-M10** | Piper fill: binary + onnx only; do not add persistent piper “server” runtime expectations. | docs / validate messaging |

PF-M1b is the urgent bind fix now that Instruct bytes exist.
