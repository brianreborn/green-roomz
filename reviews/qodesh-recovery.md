# qodesh recovery report

**Machine:** qodesh (`19f2c19e-e100-49f0-8507-813d66727973`)  
**Checked:** 2026-09-06 ~8:05–8:10 AM PT  
**Constraints honored:** no GGUF load on 8600 GT; no Afterburner clock changes; CPU llama only for green-roomz (official CPU zip, not LocalAI vulkan copy).

---

## 1. Green-Roomz

| Item | Result |
|------|--------|
| Path | `C:\Users\brian\Documents\green-roomz` — **present** |
| Health | `GET http://127.0.0.1:8080/health` → **200** |
| Status | `degraded` (uptime ~3h at check; no restart needed) |
| Start script | `scripts\start-green-roomz.ps1` present; **not run** (already listening) |

**Agent availability (health):**

| Agent | Availability | Notes |
|-------|--------------|-------|
| tool-router-agent | ready | resident |
| security-monitor-agent | ready | |
| vision-layout-agent | cold | |
| general-text-speculator | cold | |
| semantic-embedding-agent | cold | |
| retrieval-rerank-agent | cold | |
| safety-policy-agent | cold | |
| qwenstral-code-speculator | unavailable | RAM: estimate ~9.8GB + headroom > free ~7.3GB |
| audio-transcription-agent | unavailable | expects `C:\LocalAI\whisper\whisper-server.exe` — **missing** |
| speech-synthesis-agent | unavailable | expects `C:\LocalAI\piper\piper.exe` — **wrong path** (see LocalAI) |
| image-generation-agent | unavailable | expects `...\stable-diffusion.cpp\bin\sd-server.exe` — **missing** |

---

## 2. CPU llama (green-roomz runtime)

| Item | Result |
|------|--------|
| Before | `Documents\green-roomz\runtime` **missing**; no CPU `llama-server.exe` under GRZ |
| LocalAI only | Vulkan pack at `C:\LocalAI\llama-b10665-bin-win-vulkan-x64` (not used as primary) |
| Action | Fetched official zip → `%TEMP%\llama-b10702-bin-win-cpu-x64.zip` (18,145,543 bytes) |
| URL | `https://github.com/ggml-org/llama.cpp/releases/download/b10702/llama-b10702-bin-win-cpu-x64.zip` |
| Expanded to | `C:\Users\brian\Documents\green-roomz\runtime\llama-b10702-bin-win-cpu-x64\` |
| `llama-server.exe` | present at that folder (CPU build + ggml-cpu-*.dlls) |

**Config note (not changed this pass):** `config\agents.windows.json` still points `llama_server.command` at  
`C:\LocalAI\llama-b10665-bin-win-vulkan-x64\llama-server.exe` with `GGML_VULKAN=1`.  
For CPU-only GRZ, point that command at  
`C:\Users\brian\Documents\green-roomz\runtime\llama-b10702-bin-win-cpu-x64\llama-server.exe` and use `--device none` / cpu-* profiles (no Vulkan0 on 8600).

Gate-B history (`data\gate-b-llama-server.err.log`) shows a prior successful load of coder 7B+1.5B draft on `127.0.0.1:8183` (historical; not re-stressed).

---

## 3. CUDA recovery (separate from GRZ; 8600 not stressed)

| Item | Path / status |
|------|----------------|
| CUDA toolkit | **v6.5 still installed** |
| `CUDA_PATH` | `C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v6.5` |
| `nvcc` | `C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v6.5\bin\nvcc.exe` |
| `cl.exe` (VS2013) | `C:\Program Files (x86)\Microsoft Visual Studio 12.0\VC\bin\cl.exe` |
| `cl.exe` x86_amd64 | `C:\Program Files (x86)\Microsoft Visual Studio 12.0\VC\bin\x86_amd64\cl.exe` |
| deviceQuery samples | `C:\ProgramData\NVIDIA Corporation\CUDA Samples\v6.5\1_Utilities\deviceQuery\` |
| Buildables | Sources + VS2010/2012/**2013** `.sln`/`.vcxproj` present → **buildable** with VS2013 + CUDA 6.5 (sm_11 era). **Not built/run** this pass. |
| `nvidia-smi` | **not** on PATH (expected for this vintage stack) |

---

## 4. Inventory — other “lost” pieces

### LocalAI (`C:\LocalAI`)

**Present:** vulkan llama b10665 tree; GGUFs; whisper model; piper nested install; SD model.

**GGUFs:**

| File | Size | Notes |
|------|------|-------|
| qwen2.5-coder-7b-instruct-q4_k_m.gguf | ~4.4 GB | OK |
| qwen2.5-coder-1.5b-instruct-q4_k_m.gguf | ~1.0 GB | OK |
| Qwen3-4B-Q4_K_M.gguf | ~2.3 GB | OK |
| qwen2.5-vl-3b-instruct-q4_k_m.gguf + mmproj | ~1.8 + ~1.2 GB | OK |
| Qwenstral-Small-3.1-0.5B.Q4_K_M.gguf | ~439 MB | OK |
| qwen3-embedding-0.6b-q8_0.gguf | ~610 MB | OK |
| qwen3guard-gen-0.6b-q4_k_m.gguf | ~462 MB | OK |
| qwen3-reranker-0.6b-q8_0.gguf | **15 bytes** | **corrupt/stub — re-fetch** |
| Qwen3-4B-eagle3-BF16.gguf | **missing** | draft for text speculator |

**Sidecar binaries:**

| Expected (agents.windows.json) | Actual |
|--------------------------------|--------|
| `C:\LocalAI\whisper\whisper-server.exe` | **MISSING** (only `models\ggml-small.bin` ~465 MB) |
| `C:\LocalAI\piper\piper.exe` | **MISSING at that path**; real exe: `C:\LocalAI\piper\piper\piper.exe` |
| `C:\LocalAI\stable-diffusion.cpp\bin\sd-server.exe` | **MISSING** (model `models\sd15-q4_0.gguf` ~1.6 GB present; `bin\` empty of server) |

### ADB

**Not found** on PATH or common locations (`platform-tools`, Android SDK, `C:\adb`, etc.). Treat as lost / needs reinstall.

### MSI Afterburner

**Present:** `C:\Program Files (x86)\MSI Afterburner\MSIAfterburner.exe`  
**Running:** PID 3352 at check time. **No clocks tuned** (per instructions).

### Packs drop path (for later CopyFromBox)

**Created / ready:** `C:\Users\brian\Documents\green-roomz-packs\`  
Good zip drop target for parent CopyFromBox jobs.

---

## 5. Actions taken this pass

1. Confirmed GRZ health (up, degraded) — no start.
2. Downloaded + expanded official CPU llama **b10702** into `Documents\green-roomz\runtime\llama-b10702-bin-win-cpu-x64\`.
3. Inventoried CUDA 6.5 / cl / nvcc / deviceQuery (no GPU stress).
4. Inventoried LocalAI, models, ADB (absent), Afterburner (present, untouched).
5. Ensured `C:\Users\brian\Documents\green-roomz-packs\` exists.

## 6. Suggested next steps (parent / later)

1. Retarget `agents.windows.json` `llama_server.command` → CPU runtime path; prefer `cpu-4` / `cpu-2` profiles; strip Vulkan0 for GRZ.
2. Fix piper path or symlink `C:\LocalAI\piper\piper.exe` → `piper\piper\piper.exe`.
3. Restore `whisper-server.exe` and `sd-server.exe` (or retarget config).
4. Re-download `qwen3-reranker-0.6b-q8_0.gguf` (15-byte stub) and optional eagle3 draft.
5. Reinstall platform-tools / ADB if needed.
6. Copy packs into `C:\Users\brian\Documents\green-roomz-packs\`.
