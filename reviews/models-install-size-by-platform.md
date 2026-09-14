# Green-Roomz — honest rough unpacked install sizes by platform

**When:** 2026-09-07 ~00:00 PT (box UTC Sep 7)  
**Scope:** “all models working on all platforms (even if slow)” vs MVP chat-only  
**Rules:** NEVER invent sizes. `UNKNOWN` = no fail-closed `curl -sI` Content-Length / no local byte count.  
**Hard:** Never load GGUFs on **8600 GT** (qodesh display-only). Windows paths are **CPU llama**. Note9: list huge GGUFs but flag **slow / may OOM**.

**Verified locals (box):**
- `Qwenstral-Small-3.1-0.5B.Q4_K_M.gguf` = **460616064** (nexus; ~439–460 MiB band)
- `Qwen2.5-0.5B-Instruct-Q4_K_M.gguf` = **397808192** (bartowski Instruct Q4; **on** `/workspace/green-roomz/models` + hardlinked into `e2e-fresh`)

**Sources:** `config/agents.*.json`, `WINDOWS-MVP.md`, `INSTALL-WINDOWS.md`, `docs/model-lifecycle.md`, `docs/diagrams/install-platforms.md`, `release-readiness.md`, HEAD probes 2026-09-07.

---

## Preferred artifacts (one row per capability / runtime)

| Capability / agent | Preferred artifact (manifest / fetch name) | Verified unpacked / file bytes | Evidence | RAM / platform notes |
|---|---|---:|---|---|
| **nexus** `tool-router-agent` | `Qwenstral-Small-3.1-0.5B.Q4_K_M.gguf` | **460616064** | local `stat` on box | Resident router; en-only JSON. CPU mmap. |
| **general-text** MVP / tiny | `Qwen2.5-0.5B-Instruct-Q4_K_M.gguf` (bartowski) | **397808192** | HEAD `200` + local file | Windows MVP + Linux e2e chat. CPU only. |
| **general-text** optional sprint | `Qwen2.5-1.5B-Instruct-Q4_K_M.gguf` (bartowski) | **986048768** | HEAD `200` | When free RAM; still CPU on qodesh. |
| **general-text** full (`agents.windows.json`) | `Qwen3-4B-Q4_K_M.gguf` | **2497280256** | HEAD + HF API | ~2.33 GiB; Athlon 16 GB: heavy with other warm models. |
| **general-text** draft (optional) | `Qwen3-4B-eagle3-BF16.gguf` (converted) | **UNKNOWN** | conversion from HF safetensors; no verified GGUF CL | Optional; do not invent. |
| **code** `qwenstral-code-speculator` | `qwen2.5-coder-7b-instruct-q4_k_m.gguf` (Qwen) | **4683073536** | HEAD + HF API | **~4.36 GiB.** Note9 / 16 GB: **slow / may OOM** if resident+others warm. Still listed for “all models even if slow”. |
| **code draft** | `qwen2.5-coder-1.5b-instruct-q4_k_m.gguf` (Qwen) | **1117320768** | HEAD + HF API | Required by full Windows manifest when draft enabled. (bartowski Q4_K_M HEAD=986048800 — different file; prefer Qwen name matching manifest.) |
| **vision** + projector | `Qwen2.5-VL-3B-Instruct-Q4_K_M.gguf` + `mmproj-…-f16.gguf` (ggml-org; LocalAI uses lowercase aliases) | **1929901056** + **1338428128** | HEAD + HF API | Weights ~1.80 GiB + mmproj-f16 ~1.25 GiB ≈ **3.04 GiB**. Note9: **slow / may OOM**. |
| **embed** | `Qwen3-Embedding-0.6B-Q8_0.gguf` (manifest: `qwen3-embedding-0.6b-q8_0.gguf`) | **639150592** | HEAD + HF API | |
| **rerank** | `qwen3-reranker-0.6b-q8_0.gguf` (ggml-org mirror; official Qwen tree HEAD gated) | **639153184** | HEAD + HF API | Official `Qwen/Qwen3-Reranker-0.6B-GGUF` returned 401 here → used public ggml-org byte-identical Q8_0. |
| **guard** | `Qwen3Guard-Gen-0.6B.Q4_K_M.gguf` (QuantFactory; official Qwen gated) | **484219904** | HEAD + HF API | Manifest name `qwen3guard-gen-0.6b-q4_k_m.gguf`. Official Qwen repo 401 → QuantFactory CL used. |
| **whisper** model | `ggml-small.bin` | **487601967** | HEAD | |
| **whisper-server** (Win x64 zip v1.7.6) | `whisper-bin-x64.zip` → unpacked | zip **3675974** / unpacked **9090560** | HEAD + local unzip | Linux/Android whisper-server binary: **UNKNOWN** (no verified artifact in tree). |
| **piper** voice | `en_US-lessac-medium.onnx` (+ `.onnx.json`) | **63201294** + **4885** | HEAD | |
| **piper** runtime Win | `piper_windows_amd64.zip` | zip **22477236** / unpacked **38846222** | HEAD + unzip | |
| **piper** runtime Linux | `piper_linux_x86_64.tar.gz` | tar **26460462** / unpacked **52557086** | HEAD + untar | Android piper: **UNKNOWN**. |
| **sd** model | `stable-diffusion-v1-5-Q4_0.gguf` (gpustack; manifest `sd15-q4_0.gguf`) | **1747190784** | HEAD | ~1.63 GiB. Note9: **slow / may OOM**. |
| **sd-server** Win CPU | `sd-master-d8fb10c-bin-win-cpu-x64.zip` (leejet master-846) | zip **24125432** / unpacked **63589509** | GitHub asset size + unzip | Prefer CPU on qodesh; never 8600 GGUF load. |
| **sd-server** Linux CPU | `sd-master-d8fb10c-bin-Linux-Ubuntu-24.04-x86_64.zip` | zip **33045729** / unpacked **81621604** | GitHub + unzip | Android sd-server: **UNKNOWN**. |
| **llama-server** Win CPU | `llama-b10702-bin-win-cpu-x64.zip` | zip **18145543** / unpacked **45888285** | HEAD + unzip | Installer URL. **Never** vulkan/cuda zip for qodesh. |
| **llama-server** Android arm64 | `llama-b10702-bin-android-arm64.tar.gz` | tar **73506596** / unpacked **277029278** | HEAD + untar | From `deploy-android.sh`. |
| **llama-server** Linux (vendored) | pack `runtime/` (llama-server + `.so`) | **42000536** | local `du -sb` | Already inside slim pack (~same order). |
| **slim pack base** | `green-roomz-beta-0.5.2-slim.zip` | zip **26241466** / unpacked **69615580** | local | No GGUF by design. Includes Linux `runtime/llama-server`. |
| **Node** (prerequisite) | Node 22 LTS win x64 MSI `v22.23.2` | **31727616** | HEAD | Installer does **not** fetch Node. Linux often system; official linux-x64 `.tar.xz` HEAD=**31058332** (archive, not unpacked). |
| **BSD / FreeBSD** llama | system `pkg install llama-cpp` / build | **UNKNOWN** | docs only — pack ELF is Linux | Models same as Linux if disk allows. |

### HEAD URL cheat-sheet (fail-closed)

| Artifact | URL used for CL |
|---|---|
| Instruct 0.5B | `https://huggingface.co/bartowski/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/Qwen2.5-0.5B-Instruct-Q4_K_M.gguf` |
| Instruct 1.5B | `…/bartowski/Qwen2.5-1.5B-Instruct-GGUF/…/Qwen2.5-1.5B-Instruct-Q4_K_M.gguf` |
| Qwen3-4B | `https://huggingface.co/Qwen/Qwen3-4B-GGUF/resolve/main/Qwen3-4B-Q4_K_M.gguf` |
| Coder 7B | `https://huggingface.co/Qwen/Qwen2.5-Coder-7B-Instruct-GGUF/resolve/main/qwen2.5-coder-7b-instruct-q4_k_m.gguf` |
| Coder 1.5B | `https://huggingface.co/Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF/resolve/main/qwen2.5-coder-1.5b-instruct-q4_k_m.gguf` |
| VL 3B + mmproj | `https://huggingface.co/ggml-org/Qwen2.5-VL-3B-Instruct-GGUF/resolve/main/Qwen2.5-VL-3B-Instruct-Q4_K_M.gguf` (+ `mmproj-Qwen2.5-VL-3B-Instruct-f16.gguf`) |
| Embed | `https://huggingface.co/Qwen/Qwen3-Embedding-0.6B-GGUF/resolve/main/Qwen3-Embedding-0.6B-Q8_0.gguf` |
| Rerank | `https://huggingface.co/ggml-org/Qwen3-Reranker-0.6B-Q8_0-GGUF/resolve/main/qwen3-reranker-0.6b-q8_0.gguf` |
| Guard | `https://huggingface.co/QuantFactory/Qwen3Guard-Gen-0.6B-GGUF/resolve/main/Qwen3Guard-Gen-0.6B.Q4_K_M.gguf` |
| Whisper small | `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin` |
| Piper voice | `https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/lessac/medium/en_US-lessac-medium.onnx` |
| SD1.5 Q4_0 | `https://huggingface.co/gpustack/stable-diffusion-v1-5-GGUF/resolve/main/stable-diffusion-v1-5-Q4_0.gguf` |
| llama Win CPU | `https://github.com/ggml-org/llama.cpp/releases/download/b10702/llama-b10702-bin-win-cpu-x64.zip` |
| llama Android | `https://github.com/ggml-org/llama.cpp/releases/download/b10702/llama-b10702-bin-android-arm64.tar.gz` |

---

## Platform matrix (who needs what)

| Row | Linux box (cursor/e2e) | Windows qodesh (Athlon/16 GB, CPU) | Android Note9 (stock) | Android rooted Pixel8 (later) | BSD (in docs tree) |
|---|---|---|---|---|---|
| slim pack | yes (unpacked **69615580**) | yes | yes (Termux copy) | yes | yes (code); Linux ELF llama **won't run** |
| llama runtime | vendored in slim | Win CPU zip unpacked **45888285** | Android tar unpacked **277029278** | same Android build or **UNKNOWN** newer | system llama **UNKNOWN** |
| nexus 0.5B | **460616064** | same | same | same | same |
| Instruct 0.5B (MVP chat) | **397808192** (landed) | same | same (preferred text) | same | same |
| Qwen3-4B (full text) | optional / full set | full `agents.windows.json` | **flag OOM** — prefer 0.5B/1.5B | later OK if RAM | same |
| code 7B (+1.5B draft) | full set | CPU; impractical warm | **slow/may OOM** | later | same |
| vision+mmproj | full set | CPU | **slow/may OOM** | later | same |
| embed/rerank/guard | full set | full set | full set (small) | full set | same |
| whisper+server | model yes; server Linux **UNKNOWN** | model + Win server | model; server **UNKNOWN** | later | **UNKNOWN** |
| piper+voice | voice + Linux piper | voice + Win piper | voice; binary **UNKNOWN** | later | **UNKNOWN** |
| sd+server | model + Linux sd | model + Win CPU sd | model; **slow/may OOM**; server **UNKNOWN** | later | **UNKNOWN** |
| Node | usually present | MSI **31727616** (prereq) | Termux node **UNKNOWN** size | later | **UNKNOWN** |
| 8600 GT | n/a | **never GGUF** | n/a | n/a | n/a |

---

## Rough unpacked totals

Counting rules:
- **MVP chat-only** = slim pack + nexus + Instruct 0.5B + platform llama runtime (Linux llama already inside slim → not double-counted). Node listed separately.
- **Full working set** = MVP base pieces + **all** verified GGUF/bin weights from the preferred table (Qwen3-4B text, coder 7B+1.5B draft, VL+mmproj, embed, rerank, guard, whisper-small, piper voice, sd1.5) + platform whisper/piper/sd runtimes when verified.
- Eagle3 draft GGUF, Android whisper/piper/sd binaries, BSD llama, Linux whisper-server → **excluded from numeric sums** (UNKNOWN).

| Platform | MVP chat-only (verified) | Full working set (verified parts) | Notes |
|---|---:|---:|---|
| **Linux box** | **928039836** (~0.86 GiB) | **16290936688** (~15.17 GiB) | Full = slim + all models + piper Linux + sd Linux. Whisper-server Linux still UNKNOWN (add later). |
| **Windows qodesh** | **973928121** (~0.91 GiB) without Node; **1005655737** (~0.94 GiB) with Node MSI | **16314172574** (~15.19 GiB) | + Win llama/whisper/piper/sd CPU runtimes. **CPU only; never 8600.** 7B+4B+vision concurrent = thrash risk on 16 GB. |
| **Android Note9** | **1205069114** (~1.12 GiB) | **16433787276** (~15.31 GiB) models+slim+android llama | Whisper/piper/sd **Android binaries UNKNOWN** (not in sum). **7B / VL / SD: slow/may OOM** on stock Note9 RAM — still downloadable for “even if slow”. |
| **Pixel8 rooted (later)** | same order as Note9 MVP if same artifacts | same full model bytes + runtime TBD | Runtime builds **UNKNOWN** until chosen. |
| **BSD** | slim **69615580** + models MVP **858424256** + llama **UNKNOWN** | models full **16087142418** + runtimes **UNKNOWN** | Pack `runtime/llama-server` is Linux ELF — replace with system llama. |

**Models-only subtotal (full preferred set, no runtimes/slim):** **16087142418** (~14.98 GiB).

**MVP models-only (nexus+Instruct):** **858424256** (~0.80 GiB).

---

## Download / land status (box e2e)

| Artifact | Box `/workspace/green-roomz/models` | e2e-fresh | Plan |
|---|---|---|---|
| nexus Qwenstral | **present** 460616064 | present | keep |
| Instruct 0.5B bartowski | **present** 397808192 (inode shared w/ e2e-fresh) | **present** | done — required for e2e chat |
| Qwen3-4B / coder / VL / embed / rerank / guard / whisper / piper / sd | missing | missing | queue next (operator: ALL models even if slow) |
| Windows CPU llama zip | n/a (Linux vendored) | n/a | qodesh via `install-windows.cmd` |

### Suggested full-set fetch order (disk ~104 GiB free on box)

1. ~~Instruct 0.5B~~ **done**  
2. embed Q8 (~0.60 GiB), guard Q4 (~0.45 GiB), rerank Q8 (~0.60 GiB) — small specialists  
3. whisper-small (~0.45 GiB), piper voice (~0.06 GiB)  
4. Qwen3-4B (~2.33 GiB) — Linux full text (optional on Note9)  
5. VL Q4 + mmproj-f16 (~3.04 GiB)  
6. SD1.5 Q4 (~1.63 GiB)  
7. coder 7B + 1.5B draft (~5.40 GiB) — last; heaviest; Note9 OOM flag  

Point cursor/e2e manifests at real paths (replace `missing-*.gguf`) after each land; keep `--device none` on qodesh.

---

## Honesty residuals

- Official Qwen Guard/Rerank repos returned **401** to this environment; sizes taken from public mirrors with HEAD CL (not invented).  
- Manifest LocalAI lowercase names may differ from HF filenames; bytes above are for the verified public Q4_K_M / Q8_0 / Q4_0 equivalents.  
- Eagle3 draft GGUF size **UNKNOWN** until converted file exists.  
- Linux whisper-server + Android piper/whisper/sd binaries **UNKNOWN**.  
- BSD llama install size **UNKNOWN**.  
- Concurrent RAM ≠ disk: 16 GB Windows / Note9 cannot keep full set warm; “working even if slow” means cold-start + mmap thrash, not all resident.



---

## CHECKPOINT (2026-09-06 ~11:36 PM PT)

Operator ~89% usage — **stop heavy loops**. No new long fetches/sprints until resumed.

**Frozen state**
- Instruct on cursor e2e-fresh + tree: `Qwen2.5-0.5B-Instruct-Q4_K_M.gguf` / hardlink `missing-qwen-instruct.gguf` (**397808192**, GGUF magic OK)
- Live `/health` still lists instruct missing until **PF bounce** (not done)
- Size board: `/workspace/reviews/models-install-size-by-platform.md`
- Fetch plan: `/workspace/reviews/missing-models-plan.md`
- Note9 USB/qodesh Wi-Fi-off policy on docs + boards; local git commit blocked (no author identity)
- qodesh rerank LocalAI was **15 B corrupt**; replacement may be incomplete
- Partial left on disk: `models/ggml-small.bin.partial` (incomplete whisper — delete or resume later)
- Remaining gaps: vision, whisper-server+bin, embed, rerank, guard, piper+voice, sd-server+sd

Resume later: continue plan priorities; no duplicate Instruct download; PF bounce only when asked.


## RESUME (2026-09-06 ~11:41 PM PT)
Researcher: Instruct lane owned by models-fill executor — do not fight. Resume full-set: **embed / guard / rerank** next; PF-M wire from Platform when ready. Note9 USB unauthorized on qodesh awaiting Allow.
