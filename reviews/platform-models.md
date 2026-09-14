# Green-Roomz platform — missing models / runtime fill (paths)

Date: 2026-09-07 ~PT. Cite: git `/workspace/green-roomz` @ `efa7e2b`+ (PF landed). Operator ask via Researcher: fill missing models; review Win/Linux/Android path risks for new GGUFs + whisper/piper/sd. **No exploit. No push. No tree patch this board.**

Scope: fetch/layout only (where bytes land + how manifests name them). Not tokenizer quality (see PF8 / PLAT-L1). Not security P0.

---

## Inventory (what is missing)

| Role | cursor / windows-mvp path | note9 / android path | On disk (cursor box) |
|---|---|---|---|
| nexus 0.5B | `models/Qwenstral-Small-3.1-0.5B.Q4_K_M.gguf` | `$HOME/grz-runtime/models/…` | **present** |
| general-text | mvp: `Qwen2.5-0.5B-Instruct-Q4_K_M.gguf`; cursor: `missing-qwen-instruct.gguf` | `…/missing/text.gguf` | **absent** |
| code | `missing-qwen-instruct.gguf` | `…/missing/code.gguf` | **absent** |
| vision (+ mmproj) | `missing-vision.gguf` | `…/missing/vision.gguf` | **absent** |
| embed / rerank / guard | `missing-*.gguf` | `…/missing/{embed,rerank,guard}.gguf` | **absent** |
| whisper weights | `missing-whisper.bin` | `…/missing/whisper.bin` | **absent** |
| piper voice | `missing-voice.onnx` | `…/missing/voice.onnx` | **absent** |
| sd weights | `missing-sd.gguf` | `…/missing/sd.gguf` | **absent** |
| whisper-server | `runtime/missing-whisper-server` (**no** `${GRZ_EXE}`) | `…/missing/whisper-server` | **absent** |
| piper | `runtime/missing-piper` | `…/missing/piper` | **absent** |
| sd-server | `runtime/missing-sd-server` | `…/missing/sd-server` | **absent** |
| llama-server | `${GRZ_LLAMA}` | `$HOME/grz-runtime/run-llama-server.sh` | Linux ELF present |

`agents.windows.json` (shalom overlay): **every** model/runtime is absolute `C:\LocalAI\…` (Vulkan llama, mixed-case GGUF names). Not a stub layout.

Fetch today: `scripts/fetch-tiny-instruct.cmd` → writes **real** HF name `Qwen2.5-0.5B-Instruct-Q4_K_M.gguf` under `%GRZ_ROOT%\models\` (CPU only). No fetch scripts for whisper/piper/sd/vision/coder/guard.

Android: `deploy-android.sh` pushes pack + **only** `MODEL_NAME` (default nexus 0.5B) into `/data/local/tmp/grz`; `termux-start.sh` / `note9-termux-setup.sh` copy **only** that GGUF into `$HOME/grz-runtime/models/`. Specialists never migrate.

---

## Critical / High

### PLAT-M1. Stub name ≠ download name (cursor will stay “missing” after fetch)

- **files:** `config/agents.cursor.json` (`missing-qwen-instruct.gguf`); `scripts/fetch-tiny-instruct.cmd` (`Qwen2.5-0.5B-Instruct-Q4_K_M.gguf`); `config/agents.windows-mvp.json` (general-text already uses real name; code still stub).
- **impact:** Operator runs fetch-tiny → file lands → cursor validate still degrades code/text. note9 uses short `missing/text.gguf` / `missing/code.gguf` — third naming scheme.
- **fix direction:** One canonical **on-disk** name per artifact (prefer upstream HF basename). Manifests point at that name. Drop opaque `missing-*` once filled (or keep `missing-*` only as validate fail-closed sentinel, never as install target).

### PLAT-M2. qodesh / Win fill must not revive `C:\LocalAI` as the pack root

- **files:** `config/agents.windows.json` (all LocalAI); `scripts/pull-localai-from-shalom.ps1`, `copy-localai-to-d.ps1`; `docs/deployment.md` still describes LocalAI as model store; `install-windows.cmd` installs to `%LOCALAPPDATA%\Green-Roomz` and explicitly rejects LocalAI fallback (PF6).
- **impact:** Filling models into `C:\LocalAI` while serving `agents.windows-mvp.json` / cursor under LocalAppData = dual stores, wrong manifest, Vulkan path on 8600 GT host. qodesh interim is **CPU** (`--device none`); LocalAI vulkan tree is shalom-shaped.
- **fix:** Fill into `%LOCALAPPDATA%\Green-Roomz\models\` + `runtime\` (or portable `GRZ_ROOT`). Keep `agents.windows.json` as **shalom-only** overlay; never default. Document “do not copy fill into LocalAI for beta-0.4 pack”.

### PLAT-M3. Win specialist binaries missing `${GRZ_EXE}`

- **files:** `config/agents.cursor.json` / `agents.windows-mvp.json` whisper/piper/sd commands: `…/missing-whisper-server` with no `${GRZ_EXE}`.
- **impact:** After dropping `whisper-server.exe`, expand still looks for extensionless path → spawn fail. llama path got `${GRZ_LLAMA}` / GRZ_EXE; specialists did not.
- **fix:** `${GRZ_ROOT}/runtime/whisper-server${GRZ_EXE}` (and piper/sd-server). Allowlist already has `GRZ_EXE` (PF2).

### PLAT-M4. Termux: drop zone ≠ exec / model home; fill copy list is nexus-only

- **files:** `deploy-android.sh` (`DEST=/data/local/tmp/grz`); `termux-start.sh`; `scripts/note9-termux-setup.sh`; manifests `agents.note9.json` / `agents.android.json`.
- **impact:** New GGUFs pushed only to tmp never appear at `${HOME}/grz-runtime/missing/…` or `models/`. Binaries in tmp are **not executable** (SELinux); must land under `$HOME/grz-runtime/bin` with `chmod +x`, LF shebangs.
- **fix:** Layout map: adb → tmp staging → Termux copy **all** filled models to `$HOME/grz-runtime/models/` (or keep short names under `missing/` only until renamed). Never leave specialist paths on `/data/local/tmp`.

---

## Medium

### PLAT-M5. Three layout dialects

| Host | Models | Binaries |
|---|---|---|
| Win/Linux pack | `${GRZ_ROOT}/models/<file>` | `${GRZ_ROOT}/runtime/<bin>${GRZ_EXE}` |
| Termux | `${HOME}/grz-runtime/models/` + legacy `missing/` | `${HOME}/grz-runtime/bin` or `missing/` |
| shalom overlay | `C:\LocalAI\<file>` (+ nested whisper/piper/sd dirs) | `C:\LocalAI\…\*.exe` |

Fill scripts must pick **one dialect per manifest**, not mix.

### PLAT-M6. Case + NFC

- LocalAI inventory mixes `Qwen3-4B-Q4_K_M.gguf` vs `qwen2.5-coder-7b-instruct-q4_k_m.gguf`. Windows case-insensitive hides mismatches; Linux/Termux/Darwin (NFC via `nfcPath`) fail closed.
- **fix:** Preserve exact basename from fetch; never casefold in install scripts; document required spelling in a single `models/MANIFEST.txt` or fetch table.

### PLAT-M7. MAX_PATH / spaces (Win)

- With user `Brian Fundakowski Feldman`, `%LOCALAPPDATA%\Green-Roomz\models\<gguf>` ≈ 90–110 chars for current HF names — **under** classic 260 if **flat**. Nested LocalAI-style `stable-diffusion.cpp\models\…` under LocalAppData still OK for these names but erodes budget.
- Spaces in username: all `.cmd` fetch/install paths must stay quoted (fetch-tiny already quotes `OUT`).
- **fix:** Keep `models/` flat; no deep HF repo mirrors under GRZ_ROOT. Prefer 8.3-avoidance via short aliases only if a future >200-char name appears.

### PLAT-M8. Android push size / sdcard fallback

- `termux-start.sh` also accepts `/sdcard/Download/grz`. FAT/exFAT on sdcard: no symlinks, case-insensitive — `ln -sf` fallback in setup can fail; must `cp`. Long Unicode names risk.
- **fix:** Prefer cp; refuse symlink-only success when target is sdcard.

---

## Low / notes

- **PLAT-M9.** `docs/deployment.md` / council still teach LocalAI as model store — conflicts with beta LocalAppData installer story.
- **PLAT-M10.** Vision needs **two** files (model + mmproj); stub is one path — fill must pair them or validate will half-boot.
- **PLAT-M11.** Do not bind filled multilingual instruct over nexus 0.5B Tekken (PF8). Nexus stays English JSON router.
- **PLAT-M12.** qodesh: no Vulkan LocalAI tree; CPU llama only until CUDA 1.1 build exists (`docs/fleet-targets.md`).

---

## Recommended on-disk layout (fill target)

```
$GRZ_ROOT/                         # Win: %LOCALAPPDATA%\Green-Roomz
  models/
    Qwenstral-Small-3.1-0.5B.Q4_K_M.gguf          # nexus only
    Qwen2.5-0.5B-Instruct-Q4_K_M.gguf             # general-text (+ code if same tiny)
    <other HF basenames…>                         # no missing-* once filled
  runtime/
    llama-server[.exe]
    whisper-server[.exe]
    piper[.exe]
    sd-server[.exe]
    *.dll / *.so as required

# Termux only
$HOME/grz-runtime/
  models/   # same basenames as pack models/
  bin/      # llama-server, whisper-server, piper, sd-server (chmod +x)
  lib/
```

Staging only: `/data/local/tmp/grz` (adb). Never final.

---

## Do not

- Point qodesh beta pack at `agents.windows.json` / `C:\LocalAI`.
- Leave cursor on `missing-qwen-instruct.gguf` after a successful tiny fetch.
- Exec specialists from `/data/local/tmp`.
- Casefold or NFC-strip on Windows install.
- Put 0.5B Tekken on general-text/code.

---

## Status

Board only. Fix pack: `/workspace/reviews/platform-models-fixes.md` (PF-M1… if submitted).

---

## Pass addendum (LocalAI/Termux scan fold)

Folded from read-only scan after board write (same cut).

- **README.md** still documents default manifest as `agents.windows.json` + models under `C:\\LocalAI` — operator confusion **MED** (stronger than docs/deployment alone). Pack `start.cmd` defaults **windows-mvp** (PF6 clean).
- **termux-start.sh** only `mkdir …/models`; does **not** create `$HOME/grz-runtime/missing/` — specialist drops into `models/` or tmp will not bind note9/android manifests (**HIGH**, sharpens PLAT-M4).
- **ln -sf** to `/data/local/tmp` GGUF if `cp` fails remains **MED** (mmap/noexec class).
- **e2e-fresh README** still mentions LocalAI vulkan fallback; code does not.
- MAX_PATH: under short `brian` LocalAppData prefix, planned GGUF names ~82–86 chars total — ample; long display-name user still OK if `models/` stays flat.
- No `agents.qodesh*`; qodesh uses windows-mvp / cursor path.
- Confirms: no fetch for whisper/piper/sd into LocalAppData or Termux HOME.

Fix pack PF-M3/M5 unchanged in intent; PF-M5 should explicitly retarget **README.md** default-manifest language.

---

## Pass addendum 2 (full inventory audit fold)

Tree now has **both** nexus and Instruct GGUFs under `models/`:

- `Qwenstral-Small-3.1-0.5B.Q4_K_M.gguf` (460616064)
- `Qwen2.5-0.5B-Instruct-Q4_K_M.gguf` (397808192) — present; windows-mvp general-text binds it
- Still **no** whisper/piper/sd binaries; no `missing-*` stub files (intentional absent)

**ID crosswalk** (audit executor used different numbering; keep board IDs stable):

| Board | Audit alias | Note |
|---|---|---|
| PLAT-M1 stub≠fetch | — | Still open for **cursor** (code+text → `missing-qwen-instruct.gguf` while Instruct file exists) |
| PLAT-M2 LocalAI overlay | audit PLAT-M1 | + `data/download-qwen3-4b.ps1`, `e2e/harness.mjs` LocalAI cites |
| PLAT-M3 `${GRZ_EXE}` | audit PLAT-M2 | unchanged |
| PLAT-M4 Termux copy | audit PLAT-M3 + missing mkdir | unchanged |
| **NEW PLAT-M13** | audit PLAT-M4 | `${HOME}` empty-collapse → `/grz-runtime/…`; `assertRuntimeCommands` only traps `/runtime/llama-server`, not `/grz-runtime/…`. `withDefaultGrzEnv` does not map Win `USERPROFILE`→`HOME`. |
| **NEW PLAT-M14** | audit PLAT-M5 | Official `qwen2.5-0.5b-instruct-q4_k_m.gguf` vs bartowski `Qwen2.5-0.5B-Instruct-Q4_K_M.gguf` — casefold collision on Win; dual files on Linux |
| PLAT-M5 dialects | audit PLAT-M6 | unchanged |
| **NEW PLAT-M15** | audit PLAT-M7 | Piper is one-shot `execFile` in gateway — fill binary+onnx but do not expect persistent server (`process-manager` throws) |
| PLAT-M8 README | audit PLAT-M8 | confirmed |
| PLAT-M7 MAX_PATH | audit PLAT-M9 | confirmed ample for flat names |

e2e-fresh pack: no `agents.windows*.json`; prefer primary tree for Win review.

**Local box note:** `missing-qwen-instruct.gguf` is a **hardlink** (same inode, nlink=5) to `Qwen2.5-0.5B-Instruct-Q4_K_M.gguf` on this tree — cursor binds work here only. Pack/Win fetch still installs one basename; do not rely on hardlinks for PF-M1 (prefer manifest → real HF name).
