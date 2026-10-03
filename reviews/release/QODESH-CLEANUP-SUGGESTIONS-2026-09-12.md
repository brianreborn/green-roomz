# Qodesh C: cleanup SUGGESTIONS — 2026-09-12

**Host:** qodesh (Windows) · machineId `19f2c19e-e100-49f0-8507-813d66727973`  
**Constraint:** **C: ~9.1 GB free** (probe 2026-09-12; was ~2.3 GB before prior cleanup). Still too tight for VBox Machine Folder / VDIs / OPNsense ISO.  
**Rule:** **REPORT ONLY — do not delete.** Operator authorizes each removal.  
**Executor status:** Box executor has **no** cursor `ListMachines` / Shell-with-`machineId`. Parent must run the live scan.

**Scan script (parent):** `/workspace/reviews/release/qodesh-cleanup-scan.ps1`  
```powershell
# On qodesh via parent cursor Shell (machineId):
powershell -NoProfile -ExecutionPolicy Bypass -File C:\Users\brian\Documents\green-roomz\scripts\qodesh-cleanup-scan.ps1 `
  -OutFile C:\Users\brian\Documents\green-roomz\_scan\qodesh-cleanup-2026-09-12.json
# Or copy script from box first, then run.
```

---

## Already done (operator-authorized — do not redo)

| Action | Status |
|--------|--------|
| Empty Recycle Bin | **Done** |
| Delete `C:\LocalAI\_tmp` | **Done** (would have held CUDA 6.5 installer ~1.0 GB on shalom lineage; qodesh `_tmp` cleared) |
| Delete **duplicate zips** (archive where unpacked already exists) | **Done** (partial; re-scan for any new pairs) |
| **Keep FreeBSD memstick** | **KEEP** — never suggest delete |

---

## Confidence legend

| Tag | Meaning |
|-----|---------|
| **[LIVE]** | Needs parent scan output to confirm size/presence |
| **[BOARD]** | From prior boards / handoff / model inventory — estimate only |
| **[MVP-SAFE]** | Safe-ish for qodesh CPU-MVP role if specialist workloads stay on shalom / USB |
| **[KEEP]** | Do not remove without explicit new operator OK |

---

## 1. Large installed software (reinstall later)

qodesh role: Athlon II X2 · 16 GB DDR3 · **8600 GT display-only** · Green-Roomz **CPU nexus** (~3.0 tok/s). Prefer MVP pack on-host; heavy Vulkan/specialist work belongs on **shalom**.

| Package / tree | Est. size | winget uninstall id (when known) | Reinstall notes | Suggest? |
|----------------|-----------|----------------------------------|-----------------|----------|
| **Oracle VirtualBox 7.2.16** `C:\Program Files\Oracle\VirtualBox` | **[LIVE]** often 0.5–1.5 GB + Extension Pack | `Oracle.VirtualBox` | `winget install --id Oracle.VirtualBox -e` (pin 7.2.x). Machine Folder must stay **off C:** anyway — if no USB/large volume yet, uninstall frees C: until volume exists. | **Consider** only if VBox unused this week **and** no pending netmgmt create; else **KEEP** install, move Machine Folder later |
| **Node.js** `C:\Program Files\nodejs` (v24.19.0) | **[BOARD]** ~100–300 MB | `OpenJS.NodeJS.LTS` or `OpenJS.NodeJS` (confirm with `winget list`) | Required for live GRZ — **KEEP** | **KEEP** |
| **Git for Windows** (if present) | **[LIVE]** | `Git.Git` | Needed for dogfood — **KEEP** | **KEEP** |
| **Python / CMake / Ninja** (if winget-installed for CUDA build path) | **[LIVE]** | `Python.Python.3.12` (or listed id), `Kitware.CMake`, `Ninja-build.Ninja` | CUDA 6.5 toolkit **not** installed; build path stalled. Uninstall OK if not compiling; reinstall via winget later. | **Consider** if present & unused |
| **Visual Studio / Build Tools** (if any landed) | **[LIVE]** multi-GB | `Microsoft.VisualStudio.2022.BuildTools` etc. | Handoff: VS2013 **not** installed; do **not** install VS2022 as CUDA 6.5 fake. If a large VS landed by mistake → strong uninstall candidate. | **Strong consider** if found |
| **CUDA toolkit / leftover NVIDIA CUDA** | **[BOARD]** avoid | N/A — do not run old 6.5 installer on Win11 | Installer was in `_tmp` (cleared). Confirm no full toolkit under `C:\Program Files\NVIDIA GPU Computing Toolkit` | Uninstall if present |
| **McAfee** (if on qodesh; documented on shalom) | **[LIVE]** | vendor UI / `winget list` | Security product — **do not** suggest removal for space | **KEEP** |
| Games / OEM bloat / unused creative suites | **[LIVE]** | from `winget list` | Prefer winget uninstall ids from scan | Scan-driven |

**winget pattern (after operator OK):**
```powershell
winget list
winget uninstall --id <Id> -e
```

---

## 2. Large folders — LocalAI, Users, Downloads, Program Files

### 2a. `C:\LocalAI` (primary C: consumer) **[BOARD + LIVE]**

Prior layout (shalom/qodesh shared conventions):

| Path / artifact | Est. size | qodesh MVP need? | Suggestion |
|-----------------|-----------|------------------|------------|
| `Qwenstral-Small-3.1-0.5B.Q4_K_M.gguf` | **~0.44 GB** (460616064 B) | **Yes** — nexus | **KEEP** |
| `llama-b10665-bin-win-vulkan-x64\` (+ optional `.zip`) | **[BOARD]** zip ~34 MB; folder larger | Runtime for llama-server | **KEEP** folder; if `.zip` still beside unpacked → delete **zip only** (duplicate class) |
| `llama.cpp-0.3.0\` (source tree) | **[LIVE]** often 0.5–2+ GB | Build-only; not needed to serve | **Move to USB** or delete if not compiling on qodesh |
| `qwen2.5-coder-7b-instruct-q4_k_m.gguf` | **~4.4 GB** **[BOARD]** | No — CPU too slow; 7B is shalom-class | **Move off C:** (USB/`D:` if appears) or delete+re-fetch on shalom. **Biggest single win** if present |
| `Qwen3-4B-Q4_K_M.gguf` (+ eagle3 draft) | **[BOARD]** multi-GB | Optional; serve was degraded without 4B | Prefer USB; qodesh can stay 0.5B-only |
| `_tmp\Qwen3-4B` / `_tmp\Qwen3-4B_eagle3` HF snapshots | **[BOARD]** multi-GB | Convert leftovers | Confirm `_tmp` fully gone; purge any leftover HF caches |
| `qwen2.5-vl-*` + mmproj | **[LIVE]** ~2–4 GB class | Vision unused on qodesh MVP | Relocate / remove |
| `whisper\`, `piper\`, `stable-diffusion.cpp\` | **[LIVE]** | Specialists | Relocate if not dogfooding audio/SD here |
| `android-pack\arm64-v8a` | **~0.22 GB** | note9 push source | **KEEP** if still pushing from qodesh; else USB |
| `eagle3-venv\` | **[LIVE]** often 1–3 GB | shalom convert path | **Remove on qodesh** if present (venv is disposable) |
| `thinking.log` | small | ops | **KEEP** (one watcher) |
| CUDA `cuda_6.5.19_*.exe` | **~1.0 GB** | Do not run on Win11 | Should be gone with `_tmp`; if reappeared → delete or USB-archive only |

**Priority order to free ≥10–20 GB (if artifacts present):**  
1) coder **7B** GGUF → 2) Qwen3-4B + eagle3 → 3) VL/SD/whisper stacks → 4) llama.cpp **source** → 5) eagle3-venv → 6) remaining duplicate archives.

**Relocate script already on box:** `/workspace/session/copy-localai-to-d.ps1` (needs **D:** NTFS/exFAT). Prefer copy-then-verify-then-delete-from-C.

### 2b. Users (`C:\Users\brian\…`)

| Path | Notes | Suggestion |
|------|-------|------------|
| `Documents\green-roomz` | Live GRZ tree **[KEEP]** | Do not delete; prune `node_modules` only if duplicated / reinstallable (`npm ci`) **[LIVE]** |
| `Documents\Codex\…` old paste trees | Handoff mentioned Codex output trees on shalom; check qodesh | Archive old dated folders to USB |
| `Downloads\` | ISOs, zips, memstick cousins | See §3; **KEEP FreeBSD memstick** |
| `AppData\Local\Temp` | Transient | Clear **user** temp after close apps (not a blind `rd /s`) |
| `AppData\Local\npm-cache`, `pip` cache, `NuGet` | **[LIVE]** | `npm cache clean --force` / pip cache purge — safeish |
| `%LOCALAPPDATA%\Green-Roomz\models` | MVP alternate model root | Dedupe vs `C:\LocalAI` — keep one copy |

### 2c. Program Files

| Path | Suggestion |
|------|------------|
| `C:\Program Files\Oracle\VirtualBox` | See §1 — keep binary if lab soon; no VDIs on C: |
| `C:\Program Files\nodejs` | **KEEP** |
| Other multi-GB vendors from scan | Uninstall via winget |

---

## 3. Duplicate archives vs unpacked

**Policy:** If `foo.zip` (or `.7z` / `.iso.bz2`) exists **and** matching unpacked folder/`foo.iso` exists and was verified → delete **archive only**.

| Pattern | Example | Action |
|---------|---------|--------|
| llama runtime zip + folder | `llama-b10665-bin-win-vulkan-x64.zip` + `llama-b10665-bin-win-vulkan-x64\` | Delete zip if folder runs `llama-server.exe` |
| OPNsense `.iso.bz2` + decompressed `.iso` | `OPNsense-26.7-dvd-amd64.iso.bz2` (~0.47 GB) + `.iso` | Keep **one**; prefer neither on C: — USB only |
| Model `.gguf` + same bytes elsewhere | LocalAI vs `%LOCALAPPDATA%\Green-Roomz\models` | Keep single canonical path |
| **FreeBSD memstick / `.img`** | operator keep-list | **KEEP** even if “duplicate looking” |

Operator already removed some duplicate zips — re-run scan § DuplicateArchives before more deletes.

---

## 4. Windows built-in reclaim (low risk, still report-first)

Run only with operator OK (these change the system but are standard):

```powershell
# Show what would be cleaned (GUI): cleanmgr /d C
Dism.exe /Online /Cleanup-Image /AnalyzeComponentStore
# Then, if Analyze says reclaimable:
# Dism.exe /Online /Cleanup-Image /StartComponentCleanup
```

- Delivery Optimization cache, thumbnail cache, old Windows Update leftovers — via Disk Cleanup / Storage Sense.  
- **Do not** compact OS / disable hibernate without asking (hiberfil can be GBs on 16 GB RAM host).

---

## 5. Target free-space outcomes

| Goal | Why |
|------|-----|
| **≥25–40 GB free on C:** | Comfortable dogfood + Windows updates |
| **VMs/ISOs never on C:** | Netmgmt VBox needs ≥40–80 GB on USB/other volume (`NETMGMT-VBOX-SNAPSHOT-PLAN`) |
| **qodesh LocalAI ≈ MVP** | 0.5B + llama runtime (+ optional android-pack) ≈ **&lt;2 GB** active; specialists on shalom/USB |

---

## 6. Parent next steps

1. Copy `qodesh-cleanup-scan.ps1` to qodesh; run with machineId Shell; save JSON/MD under `Documents\green-roomz\_scan\`.  
2. Paste top LocalAI children + winget list back into this folder as `QODESH-CLEANUP-SCAN-RAW-2026-09-12.md`.  
3. Operator picks rows from §1–§3; executor/parent may draft exact `Remove-Item` / `winget uninstall` lines **only after** explicit delete authorization.  
4. After reclaim, re-probe `Get-PSDrive C` and update `NETMGMT-VBOX-SNAPSHOT-PLAN` free-space line.

---

## Sources (boards / handoff — not a live du)

- `NETMGMT-VBOX-SNAPSHOT-PLAN-2026-09-12.md` — C: **9.1 GB** free; LocalAI on C:; only C: visible  
- `MODEL-PACK-INVENTORY-2026-09-12.md` — GGUF roles; qodesh = windows-mvp / CPU  
- `session-handoff-2026-08-28.md` — paths, 0.5B bytes, llama zip 34476938, CUDA `_tmp` on shalom  
- `copy-localai-to-d.ps1` — coder 7B **4.4 GB** FAT32 warning; LocalAI layout  
- `QODESH-BOUNCE-NOTES-P0-FALLTHROUGH.md` — live tree + Node path  
- Operator turn: recycle emptied · `_tmp` + dup zips deleted · FreeBSD memstick kept · cursory disk look OK  

**No deletions performed by this executor.**
