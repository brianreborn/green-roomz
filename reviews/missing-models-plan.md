# Missing models — fetch / wire plan

**Owner:** Release Driver  
**Updated:** 2026-09-06 ~11:40 PM PT  
**HEAD:** `85c2c3c`  
**Size table:** `/workspace/reviews/models-install-size-by-platform.md` (HEAD-verified; no invented bytes)  
**Hard:** CPU only; never GGUF on 8600 GT; no git push; PF bounce only when wiring live; don’t fight an in-flight Instruct download.

Operator: **ALL models must work on ALL platforms even if slow.**

---

## Priority order

| P | Artifact | Bytes (verified) | Dest (cursor e2e-fresh) | Wire | Platforms |
|---|----------|-----------------:|-------------------------|------|-----------|
| 0 | Qwen2.5-0.5B-Instruct-Q4_K_M.gguf | 397808192 | `models/` + link/copy as `missing-qwen-instruct.gguf` **or** retarget cursor/mvp manifests | general-text + code | all |
| 1 | Re-fetch `qwen3-reranker-0.6b-q8_0.gguf` | 639150304 (dean2155) | qodesh `C:\LocalAI\` (replace **15 B stub**) | rerank | Win first; then mirror |
| 2 | `qwen3-embedding-0.6b-q8_0.gguf` | 639150592 | cursor `models/missing-embed.gguf` via copy/symlink | embed | all |
| 3 | `qwen3guard-gen-0.6b-q4_k_m.gguf` | 484219904 | `missing-guard.gguf` | guard | all |
| 4 | `ggml-small.bin` | 487601967 | `missing-whisper.bin` + whisper-server binary | whisper | all |
| 5 | `en_US-lessac-medium.onnx` (+ json 4885) | 63201294 | `missing-voice.onnx` + piper bin | piper | all |
| 6 | `qwen2.5-vl-3b-instruct-q4_k_m.gguf` (+ mmproj optional 1338428128) | 1929901056 | `missing-vision.gguf` | vision | all (slow/sequential on phones) |
| 7 | `sd15-q4_0.gguf` | 1747190784 | `missing-sd.gguf` + sd-server | sd | all |
| 8 | Full Win extras already on qodesh LocalAI | Qwen3-4B 2497280256; coder-7B 4683073536 | keep LocalAI paths for `agents.windows.json` | windows.json | Win; optional copy elsewhere |

Nexus **already present** cursor+qodesh: 460616064. Monitor logical: ready.

---

## Fetch URLs (verified)

| File | URL |
|------|-----|
| Instruct 0.5B Q4_K_M | `https://huggingface.co/bartowski/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/Qwen2.5-0.5B-Instruct-Q4_K_M.gguf` |
| Embed Q8_0 | `https://huggingface.co/Qwen/Qwen3-Embedding-0.6B-GGUF/resolve/main/Qwen3-Embedding-0.6B-Q8_0.gguf` |
| Rerank Q8_0 | `https://huggingface.co/dean2155/Qwen3-Reranker-0.6B-Q8_0-GGUF/resolve/main/qwen3-reranker-0.6b-q8_0.gguf` |
| Guard Q4_K_M | Use LocalAI copy on qodesh **or** QuantFactory `Qwen3Guard-Gen-0.6B.Q4_K_M.gguf` (484219904) |
| Whisper small | `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin` |
| Piper voice | `https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx` |
| VL 3B | `https://huggingface.co/lmstudio-community/Qwen2.5-VL-3B-Instruct-GGUF/resolve/main/Qwen2.5-VL-3B-Instruct-Q4_K_M.gguf` |
| SD15 Q4_0 (gpustack-sized) | Prefer copy from qodesh LocalAI `sd15-q4_0.gguf` (1747190784) over second-state pruned (1566768416) |

Script: `scripts/fetch-tiny-instruct.cmd` for Instruct on Windows. Linux: `curl -L --fail -o …partial && mv` with size gate ≥100000000 for Instruct.

---

## Coordination

- **Instruct:** another executor may already be fetching — check for `*.partial` / curl before starting. Owner of active download wins; Release Driver wires after file lands.
- **qodesh LocalAI:** prefer robocopy/copy of verified files to Documents\green-roomz\models and to box via CopyToBox when needed (don’t re-download 7B/VL if LocalAI good).
- **Rerank 15 B stub:** delete/replace before any health claim.

## Bounce policy

- Overlay files on e2e-fresh disk first.
- **PF-aware bounce only** when ready to pick up new models (pidfile stop — never `/IM llama-server.exe`, never blind `stop.sh` against wrong tree without ask).
- Leave live serve alone until Instruct (P0) is on disk and operator/Researcher OK bounce.

## Success checks

1. `stat` sizes match table.  
2. `/health` reasons clear for each wired alias after bounce.  
3. qodesh MVP battery still 7/7 with CPU threads=1.  
4. Size board + this plan updated; readiness deltas noted.

## Pack notes

- beta-slim stays **without** multi-GB GGUFs.  
- Document full install as host `models/` + LocalAI, not zip.  
- Optional future `beta-*-models` sidecar zip only with verified checksums.


## Status note (2026-09-06 ~11:41 PT)

Instruct **397808192** now on disk at cursor `models/Qwen2.5-0.5B-Instruct-Q4_K_M.gguf` and hardlinked as `missing-qwen-instruct.gguf` (e2e-fresh + tree). Live `/health` still lists missing until **PF bounce**. Nexus unchanged.


---

## Note9 ops policy (operator, 2026-09-06 ~11:35 PM PT)

- Plug **USB into qodesh** with **Wi-Fi OFF** (local-only).
- Prefer **USB ADB** over wireless.
- After device appears, optional enforce: `adb shell svc wifi disable` (leave airplane/Wi-Fi off).
- **No Knox**, no root wipe / secure_reboot / map abuse.
- Stock/unrooted Termux/`HOME` path; sidecar `:8199` via `adb reverse` as before.


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
