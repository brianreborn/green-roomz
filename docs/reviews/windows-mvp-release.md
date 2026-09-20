# Windows MVP dogfood release (qodesh)

**Cut:** localhost OpenAI gateway on Win11 Athlon II / 16 GB / **8600 GT display-only**. CPU llama only. Never load GGUFs on the 8600 GT. Do not git push. Do not bounce serve. Do not start downloads, CUDA installer, 4B/7B, or sprints.

| | |
|---|---|
| Host | qodesh |
| Manifest | `config/agents.windows-mvp.json` (`0.1.0-windows-mvp`) |
| Gateway | `http://127.0.0.1:8080` (`policy=responsive`) |
| Operator guide | `WINDOWS-MVP.md` |
| Date of last battery | 2026-09-07 ~00:38–00:43 UTC |

This is **dogfood**, not a quality/SOTA ship. Tiny Instruct will ramble; capability surface is what passed.

---

## What already works

### CPU llama + resident nexus

- Runtime pack: `runtime/llama-b10702-bin-win-cpu-x64/llama-server.exe` (also `scripts/start-windows-mvp.cmd` sets `GRZ_LLAMA` there).
- CPU pins on the live chat path: `--device none`, `--n-gpu-layers 0`, `--flash-attn off`, `GGML_VULKAN=0`.
- **Nexus** `tool-router-agent` is resident English JSON router on `Qwenstral-Small-3.1-0.5B.Q4_K_M.gguf` (port 8187). Last `data/children.json`: pid ready on 8187. Do **not** reuse Tekken as general chat.
- **Chat** `general-text-speculator` is the user-visible model: CPU mmap of the tiny Instruct GGUF, profiles `cpu-1` / `cpu-1b`.
- Start (already the pack default): `node bin\green-roomz.mjs serve --manifest config\agents.windows-mvp.json --host 127.0.0.1 --port 8080` or `scripts\start-windows-mvp.cmd`.
- Client: curl, any OpenAI-compatible client at localhost, or `scripts\chat-mvp.cmd`. No API key. No chat SPA in this cut.

### Parity battery — 7/7 PASS (health still degraded)

`data/mvp-parity-last.json` (`green-roomz.mvp-parity-battery.v1`, host hint `qodesh-windows-mvp`):

| ID | Case | Result |
|----|------|--------|
| A | `GET /health` | PASS — `product=Green-Roomz` `status=degraded` HTTP 200 |
| B | `GET /v1/models` | PASS — 11 aliases listed |
| C | non-stream chat (`general-text-speculator`) | PASS — HTTP 200, reply `parity-ok` (~17s) |
| D | multi-turn name recall | PASS (soft: no literal “Ada”; HTTP ok) |
| E | `stream:true` SSE | PASS — 51 `data:` lines, `done=True` |
| F | abort mid-stream | PASS — client kill; no server cancel ACK required |
| G | system + user roles | PASS — HTTP 200 (wording is weak 0.5B) |

Plan: `docs/mvp-parity-battery.md`. Athlon-friendly prompts, `max_tokens` 48–128.

### Wave 1 — missing native specialist → 503

Landed (see `data/wave1-503-summary.md`). Explicit native/speech hops no longer fall through to resident 200:

- `/draw` `/imagine` and `model: image-generation-agent` → **503** when image-gen cannot admit.
- `/tts` missing piper → **503** (empty `/tts` text is still **400** if speech is admittable).
- `/embed` `/rerank` `/audio` slash to a missing native → same 503 path.
- `/code` on impractical/missing `qwenstral-code-speculator` still **200 resident 0.5B** (unchanged).
- `/route` still 200-names an unavailable native; only `/v1/chat/completions` 503s.

Tests noted with that patch: 66 run, Wave 1 cases green; **5 unrelated pre-existing reds** (intent regex vs nexus, public-bind error text, session stickiness). Do not treat those as this cut’s ship gate.

---

## Instruct GGUF — landed (do not fetch)

Checked on disk. **Did not download.**

| Where | Tiny chat Instruct `Qwen2.5-0.5B-Instruct-Q4_K_M.gguf` |
|---|---|
| `C:\Users\brian\Documents\green-roomz\models\` | **Yes** — landed. Manifest points `general-text-speculator` here. |
| `C:\LocalAI\` | **No** file of that name. LocalAI has other instruct-named weights (coder 1.5B/7B, VL-3B, `Qwen3-4B-Q4_K_M.gguf`) plus the **nexus** `Qwenstral-Small-3.1-0.5B.Q4_K_M.gguf`. Those are **not** this MVP chat model. Do not copy 4B/7B/VL onto qodesh serve. |

Also in `models/` (not the chat Instruct): `Qwenstral-Small-3.1-0.5B.Q4_K_M.gguf`, `ggml-small.bin`, `en_US-lessac-medium.onnx`. `scripts/fetch-tiny-instruct.cmd` is a no-op if the GGUF already exists — **do not run it**.

---

## Blockers / expected limits

### Health is `degraded` — why

`GET /health` is **degraded whenever any listed agent is `unavailable`**, not when chat is down (`src/gateway.mjs` `health()`). Parity case A **allows** `ok` or `degraded`.

On the Windows MVP manifest, most of the 11 aliases are **placeholders**. Typical missing artifacts:

| Alias | Why unavailable (current `agents.windows-mvp.json`) |
|---|---|
| `vision-layout-agent` | `models/missing-vision.gguf` |
| `audio-transcription-agent` | `runtime/missing-whisper-server` (ggml-small.bin **is** on disk; whisper-server binary is not) |
| `qwenstral-code-speculator` | `models/missing-qwen-instruct.gguf` — cold until RAM allows; `/code` falls back to resident |
| `semantic-embedding-agent` | `models/missing-embed.gguf` |
| `retrieval-rerank-agent` | `models/missing-rerank.gguf` |
| `safety-policy-agent` | `models/missing-guard.gguf` |
| `image-generation-agent` | `runtime/missing-sd-server` + `models/missing-sd.gguf` |

Ready/cold on this cut: **nexus** (resident), **general-text-speculator** (cold until first chat), **security-monitor-agent** (logical mailbox). Piper `runtime/piper.exe` + `models/en_US-lessac-medium.onnx` exist in the pack; speech may be admittable on a serve that loaded the current JSON. Stale snapshots `data/health-now.json` / `data/health-snap.json` still show older `missing-whisper.bin` / `missing-piper` paths — treat those as **not** the current MVP manifest.

`docs/known-bugs.md` also says qodesh `:8080` is degraded without Qwen3-4B. **Do not fetch 4B** to “fix” health. Degraded is the dogfood status.

### Empty `profiles` / `max_warm_specialists` (Race)

Race’s config debt, still true in `config/agents.windows-mvp.json`:

- `gateway.max_warm_specialists` is **1**. Only one non-resident llama specialist may stay warm (Athlon 16 GB). Nexus resident does not count. **Keep this cap.** Raising it on this box is an OOM risk, not a ship item.
- Empty `profiles: []` on vision, audio, embed, rerank, safety, speech, image-gen. `ProcessManager.orderProfiles` substitutes `{ id: "default", args: [] }` when the list is empty — **no `--device none` / `--n-gpu-layers 0`**. If those agents ever become admittable without cpu-1 profiles, spawn could miss the CPU-only pin. Chat + nexus already have `cpu-1` / `cpu-1b`. Code has profiles but no GGUF.

Do **not** fill profiles by fetching models. If anything is enabled later from files already on disk, copy the cpu-1 arg block first.

### Note 9 is ADB-ready — not this MVP cut

`docs/fleet-targets.md`: shalom ADB to **SM-N960U / SDM845 / Adreno 630 / Android 10 / 5.7 GB** (`27841130ae1c7ece`). Android CPU pack / Termux / `config/agents.android.json` is a **later** fleet item. llama.android APK is minSdk 33 (Pixel 8), not Note 9 API 28. **Out of this Windows dogfood.** No `adb push`, no NDK sprint.

---

## Next ship checklist (no downloads)

Stay on files already on qodesh. No Hugging Face, no CUDA 6.5 installer, no 1.5B/4B/7B, no serve bounce unless the operator asks.

1. **Dogfood the surface that passed.** Point clients at `http://127.0.0.1:8080`, model `general-text-speculator`. `scripts\chat-mvp.cmd` for multi-turn. Expect slow Athlon tokens and weak wording (cases D/G).
2. **Treat `degraded` as green for this cut.** Do not chase `/health` `ok` by adding specialists.
3. **Keep Instruct where it is.** `models\Qwen2.5-0.5B-Instruct-Q4_K_M.gguf` is landed; skip `fetch-tiny-instruct.cmd`.
4. **Race config (docs/config only if a later operator edit):** leave `max_warm_specialists: 1`. If enabling a specialist that already has a local file, add `cpu-1` profiles before first spawn so `default` args cannot hit the 8600 GT.
5. **Wave 1 leftovers:** five unrelated test reds (intent regex / session stickiness / public-bind message). Optional unit-test cleanup; not a download, not a serve bounce.
6. **Optional TTS smoke** only if current serve already admits `speech-synthesis-agent` (piper.exe + onnx already in-tree). Missing piper still 503 by Wave 1. Do not fetch voices.
7. **Help page gap:** `WINDOWS-MVP.md` points at `docs\help\index.html` — that tree is not on disk. Curl/chat-mvp is the client.
8. **Hard rules unchanged:** CPU llama only; do not stop Linux cursor `:8080`/`:8187`; do not git push; nexus stays 0.5B JSON router.
9. **Not this cut:** Note 9 / Android pack, vision/embed/rerank/guard/sd, Qwen2.5-1.5B, Qwen3-4B, CUDA 6.5, Vulkan on 8600 GT.

**Ship call:** Windows MVP dogfood is **usable on qodesh** for localhost chat (CPU Instruct + nexus + 7/7 parity + Wave 1 503). Health `degraded` is expected. Do not enlarge the model set to make the badge green.
