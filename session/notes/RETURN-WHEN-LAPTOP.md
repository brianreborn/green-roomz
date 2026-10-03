# Green-Roomz — return when shalom (laptop) is back

**11:50 PT autotune+deploy DONE.** Hybrid fractions expanded from GGUF `block_count`; `deploy`/`serve` load winners; official-manifest smoke HTTP 200 both live aliases; leftover llama-server/llama-bench = none.

Windows project:
`C:\Users\brian\Documents\Codex\2026-08-28\files-pasted-by-the-user-1\outputs\green-roomz`

Box tree:
`/workspace/session/green-roomz`

Copied this pass: `src/autotune.mjs`, `src/benchmark.mjs`, `src/process-manager.mjs`, `src/proxy.mjs`, `bin/green-roomz.mjs`, `test/autotune.test.mjs`, `test/benchmark.test.mjs`, `test/helpers.mjs`, `test/proxy.test.mjs`. Tests **51/51** box and Windows.

Host: win32 Ryzen 5 7520U, 8 logical CPUs, 15.24 GB RAM, Vulkan0 AMD Radeon 8058 MiB shared. llama-server `C:\LocalAI\llama-b10665-bin-win-vulkan-x64\llama-server.exe` b10665 / `0.3.0-dev` / `ca3d5a3e1`.

---

## 0. Autotune + official-manifest smoke (11:30–11:50 PT)

Auto-tune now expands hybrid GPU-layer fractions from GGUF `*.block_count` (example n=28 → hybrid-7/14/21). A fixed hybrid-12 is **not** the only hybrid when layers are readable. `green-roomz deploy` qualifies missing winners then listens like serve. `serve` still loads `data/benchmarks.json` winners.

| Alias | nLayers | Expanded ids | --quick new hybrids (pp/tg) | Winner |
|---|---|---|---|---|
| `qwenstral-code-speculator` | 28 | vulkan-all, hybrid-7, hybrid-14, hybrid-21, cpu-4 | 7=20.40/4.18, 14=22.21/3.60, 21=24.21/3.01 | **vulkan-all** (cached full 27.22/2.55) |
| `general-text-speculator` | 36 | vulkan-all, hybrid-9, hybrid-18, hybrid-27, cpu-4 | 9=32.34/4.39, 18=34.93/4.32, 27=40.32/4.35 | **vulkan-all** (cached full 41.33/5.31) |

No new hybrid beat vulkan-all on throughput, so full llama-bench was **not** re-run. hybrid-12 cache remains in the store unused by the expanded set. cpu-4 for 7B was not spawned on smoke (`--n-gpu-layers all`).

Official-manifest `serve --port 18080` smoke (no temp vulkan-only json):

- GET `/v1/models` HTTP 200 (10 aliases; 7 unavailable artifacts; 2 COLD; tool-router READY)
- GET `/health` HTTP 200 `degraded`
- POST `qwenstral-code-speculator` HTTP **200** profile **vulkan-all** ngl=all ctx=4096 draft 17/17 finish=length gen=2.02 t/s
- POST `general-text-speculator` HTTP **200** profile **vulkan-all** ngl=all ctx=8192 thinking auto-off finish=stop content=`Hello! How can I assist you today?` gen=2.92 t/s
- 4B first POSTs were HTTP 500 `fetch failed` because proxy forwarded curl `Content-Length` after `prepareInferenceBody` enlarged the JSON. `src/proxy.mjs` now skips `content-length`. Health-check body is consumed (`waitForReady`).
- SIGINT/stop: llama-server gone, ports 18080/8183/8184/8080 clear, leftover=none.

`green-roomz deploy [--quick]` is implemented (qualify missing llama_server winners, print `deployed alias=profileId`, then listen). Smoke used `serve` after `--quick` qualify so winners were already in the store.

Report: `data/deploy-report.json` on both trees.

**Still leftover (not done):** 7 missing artifacts (§4) and EAGLE-3 convert (§3). Do not fetch them in this pass. Do not leave llama-server running.

---

## 1. Existing measured benches (smoke POSTs, not llama-bench)

Earlier short `/v1/chat/completions` timings (not llama-bench). Real `green-roomz benchmark --quick` **has now been run** (see §0). Keep this table as historical smoke.

| When PT | Path | Alias | Profile | ctx | Draft | HTTP | prompt tok/s | gen tok/s | wall | llama WS | RAM notes | Source |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 9:11 AM | Direct llama-server vulkan-all (`ngl=99`, not gateway) | `qwenstral-code-speculator` | vulkan-all | 1024 | CPU draft 9/9 (`spec-draft-device none`, `ngl-draft 0`) | live OK | 14.64 | 2.12 | 7.7 s (post-load; load 33.3 s) | 2578.8 MB | free RAM before ~5.69 GB could not hold 4.36+1.04 GiB CPU-resident; after stop 7.18 GB (`free_ram_kb_after` 7532420) | `/workspace/session/gate-b/gate-b-live-report.json` |
| 9:43 AM | `green-roomz serve` (temp vulkan-all-only manifest) | `qwenstral-code-speculator` | vulkan-all | 1024 | 9/9 | 200 | 14.204 | 2.265 | 32.8 s cold (`wall_ms` 32774) | 7203.5 MB | free GB before 5.86 / during 0.30 / after stop 7.98 | `/workspace/session/gateway-live/report.json` |
| 10:02 AM | `green-roomz serve` (temp vulkan-all-only, draft off) | `general-text-speculator` | vulkan-all | 1024 | off (EAGLE-3 not converted) | 200 | 9.47 | 3.43 | 16.3 s (`wall_ms` 16260) | 5027.8 MB | free GB before 5.78 / during 1.31 / after 6.31 | `/workspace/session/green-roomz/data/qwen3-4b-completion.json` + `live-4b-report.json` |

7B artifacts already on disk (Gate B probe): `qwen2.5-coder-7b-instruct-q4_k_m.gguf` 4.36 GiB, draft `qwen2.5-coder-1.5b-instruct-q4_k_m.gguf` 1.04 GiB.

Qwen3-4B target (10:02 PT): `C:\LocalAI\Qwen3-4B-Q4_K_M.gguf` **2497280256** bytes, sha256 **7485fe6f11af29433bc51cab58009521f205840f5b4ae3a32fa7f92e8534fdf5**. Thinking used all 24 `max_tokens`; `content` empty, `finish_reason=length`, inference otherwise OK.

Gateway hangup patch already in box `src/gateway.mjs` (abort only if response closes before `writableFinished`) and `src/process-manager.mjs` (aborted starts stay cold, not unavailable).

11:50 PT smoke used the **official manifest** (ctx 4096 code / 8192 text) with store winners = vulkan-all. Earlier 10:02 PT smokes used a temp vulkan-all-only manifest and ctx 1024.

---

## 2. Re-run for REAL benchmarking (when shalom is awake)

Not another 24-token POST. Use the CLI calibrator (`llama-bench` next to `llama-server.exe`).

```powershell
$node = 'C:\Program Files\nodejs\node.exe'   # or the Codex bundled node used earlier
cd C:\Users\brian\Documents\Codex\2026-08-28\files-pasted-by-the-user-1\outputs\green-roomz
# after copying box files:
& $node --test .\test\*.test.mjs
& $node .\bin\green-roomz.mjs validate
& $node .\bin\green-roomz.mjs fingerprint

# coarse then confirmation (cached by host/runtime/manifest/artifact/profile digest)
& $node .\bin\green-roomz.mjs benchmark qwenstral-code-speculator --quick
& $node .\bin\green-roomz.mjs benchmark general-text-speculator --quick
# if --quick looks sane and RAM is calm:
& $node .\bin\green-roomz.mjs benchmark qwenstral-code-speculator
& $node .\bin\green-roomz.mjs benchmark general-text-speculator
```

`--quick` is `pp64/tg16` × 1 rep; full is `pp256/tg64` × 3 reps (see `src/benchmark.mjs`). Results land in `data/benchmarks.json`.

**Winners ARE loaded** from `data/benchmarks.json` into `ProcessManager.selectedProfiles` on bootstrap/serve (`winnersFromStore`, maximize → throughput). Missing cache file does not throw; serve still starts.

CPU-resident profiles are **skipped** (not spawned, not just reordered last) when `estimateResidentBytes + 2 GiB headroom > freeMemoryBytes`. Estimate is file size × 1.6 + 512 MiB pad, CPU profiles only (`--n-gpu-layers 0` / `--device none`). GPU profiles are not skipped on file size. Unknown/missing GGUF size does not block. `qwenstral-code-speculator` cpu-4 (~7.3 GB WS) is impractical on this 15 GB host; text cpu-4 (Qwen3-4B) can still fit when free RAM allows.

Do not add `--mlock` as the primary fix. Stop leftover `:18080` / llama-server first. Do not leave llama-server resident into suspend.

**Still leftover (not done):** 7 missing artifacts (see §4) and EAGLE-3 convert (see §3). Do not fetch them in this pass.

---

## 3. EAGLE-3 conversion (optional, skipped 10:02 PT)

Not done. Target-only Qwen3-4B is the mandatory fallback (already live-POST’d). Keep EAGLE-3 off until conversion + load + output-equivalence + end-to-end benefit.

Pinned from `config/agents.windows.json` / 10:02 PT report:

- Converter: `C:\LocalAI\llama.cpp-0.3.0\convert_hf_to_gguf.py` (has `--target-model-dir`)
- Draft snapshot: Hugging Face `AngelSlim/Qwen3-4B_eagle3`, file `model.safetensors`, sha256 `58ac5bbfdd71047ebaa5d5535b895c2af37004eb820ca2dda55bd7666658853e`
- Target-model/tokenizer dir: local snapshot of `Qwen/Qwen3-4B` (HF), passed as `--target-model-dir`
- Expected outfile: `C:\LocalAI\Qwen3-4B-eagle3-BF16.gguf`
- Conversion shape from the manifest: `convert_hf_to_gguf.py <draft-snapshot> --target-model-dir <Qwen/Qwen3-4B-snapshot> --outtype bf16 --outfile Qwen3-4B-eagle3-BF16.gguf`

Then: confirm the GGUF exists, `validate` still COLD (draft is optional), `serve` on official manifest (box patch skips `--model-draft` when the optional file is missing; attaches it when present), then `benchmark general-text-speculator` with and without draft. Do not enable EAGLE-3 as winner until those gates pass.

---

## 4. Remaining artifacts (7 aliases still missing)

From 10:02 PT `validate` (`/workspace/session/green-roomz/data/qwen3-4b-validate.json`):

| Alias | Missing (paths from official Windows manifest) |
|---|---|
| `vision-layout-agent` | `C:\LocalAI\qwen2.5-vl-3b-instruct-q4_k_m.gguf` + `C:\LocalAI\qwen2.5-vl-3b-mmproj-f16.gguf` |
| `audio-transcription-agent` | `C:\LocalAI\whisper\whisper-server.exe` + `C:\LocalAI\whisper\models\ggml-small.bin` |
| `semantic-embedding-agent` | `C:\LocalAI\qwen3-embedding-0.6b-q8_0.gguf` |
| `retrieval-rerank-agent` | `C:\LocalAI\qwen3-reranker-0.6b-q8_0.gguf` |
| `safety-policy-agent` | `C:\LocalAI\qwen3guard-gen-0.6b-q4_k_m.gguf` |
| `speech-synthesis-agent` | `C:\LocalAI\piper\piper.exe` + `C:\LocalAI\piper\voices\en_US-lessac-medium.onnx` |
| `image-generation-agent` | `C:\LocalAI\stable-diffusion.cpp\bin\sd-server.exe` + `C:\LocalAI\stable-diffusion.cpp\models\sd15-q4_0.gguf` |

Present and previously live: `qwenstral-code-speculator` (7B+1.5B), `general-text-speculator` (Qwen3-4B target only), `tool-router-agent` (logical, always ready).

---

## 5. Box patches (10:04 PT + 11:19 PT admission/winners + 11:50 PT autotune)

0. **Autotune:** `src/autotune.mjs` (`readBlockCount`, `hybridLayerPoints`, `expandLayerProfiles`, `refineAround`). `BenchmarkRunner.qualify` uses expanded hybrids; pass 1 `--quick`; pass 2 refine+full top-2 only if not `--quick`. `green-roomz deploy` qualifies missing winners then serves.
1. **Proxy content-length:** do not forward incoming `Content-Length` (4B thinking-off body rewrite).
2. **Health body:** `waitForReady` consumes `/health` body and sends `Connection: close`.


1. **Profile order:** `config/agents.windows.json` lists `vulkan-all`, `hybrid-12`, `cpu-4`. `orderProfiles` still RAM-tight-reorders CPU last when GGUF bytes > free RAM.
2. **Admission skip:** `src/memory.mjs` (`headroomBytes` = 2 GiB, `estimateResidentBytes`, `profileAdmitted`). `ProcessManager.start` skips a profile when estimate+2GiB > free (does not spawn). On startProfile failure, tries the **next** profile (not only outofdevicememory). Abort/signal still throws and stays cold.
3. **Benchmark qualify:** skips impractical CPU profiles (`includeDraft=false`); on runLlamaProfile throw, records skipped/error and continues so a remaining profile can still win (and JSON is not lost).
4. **Winners → serve:** `winnersFromStore` + `applyStoreWinners` load `data/benchmarks.json` into `selectedProfiles` on bootstrap/serve. Maximize → throughput. File missing is fine.
5. **Optional draft:** `buildLaunch` omits `--model-draft` when `draft_optional` and the file is absent.
6. **Qwen3 short completions:** `prepareInferenceBody` sets `chat_template_kwargs.enable_thinking=false` for `general-text-speculator` when `max_tokens` is set and `< 64`, unless the client already set thinking.
7. Tests: memory/admission, start skip, qualify continue, winnersFromStore. Existing tests still pass.

Copy at least: `src/memory.mjs`, `src/process-manager.mjs`, `src/benchmark.mjs`, `bin/green-roomz.mjs`, `test/memory.test.mjs`, `test/benchmark.test.mjs`, `test/process-manager.test.mjs`.

---

## 6. Suggested first commands on resume

1. Copy box files onto the Windows green-roomz tree.
2. `node --test .\test\*.test.mjs` (Windows previously needed the glob; `node --test` hung when pointed at the folder).
3. `validate` + `fingerprint`. Confirm no leftover llama-server / `:18080`.
4. `benchmark` the two text aliases (`--quick` first). Save stdout next to `data/`.
5. Optional: EAGLE-3 convert; fetch any of the seven missing artifacts; only then smoke-serve with thinking-on and a larger `max_tokens`.
