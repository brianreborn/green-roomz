# Model pack inventory — offline green-roomz security workstation

**Date:** 2026-09-12  
**Canonical tip:** `brianreborn/green-roomz` `main@eb4a9f7` (`eb4a9f74bef93c2792c34041a03a0d33eb0f9e5f`) — `feat(fetch): add fetch-models.mjs … and make-moderation harness`  
**Related tip commits:** `c529ce4` (embed/rerank/moderation/image harnesses); Unicorn/UAT chain `ff117b1`…`a3d05a0`  
**Fleet hosts in scope:** qodesh, shalom, godslove, note9, pixel8  

**Hard constraints (boards + docs):**
- Termux / **note9**: **resident tool-router GGUF only** on phone (`:8187`); specialists stay missing/unavailable; `~/grz-runtime` exec; 256 MiB RAM headroom when `totalmem < 8 GiB` (`docs/note9-termux.md`, release boards).
- **qodesh**: never load GGUFs on **8600 GT**; CPU llama only (`WINDOWS-MVP.md`, `RELEASE-READINESS.md`).
- Larger chat/code/vision packs belong on a **moderately powerful offline machine** (shalom-class Vulkan or strong CPU host), not on the phone.

**Sources used (real only):** git clone of tip; `scripts/fetch-models.mjs`, `scripts/fetch-tiny-instruct.cmd`, `scripts/note9-sync-models.ps1`; `config/agents.{note9,android,windows-mvp,windows}.json`; `docs/note9-termux.md`, `docs/fleet-targets.md`, `WINDOWS-MVP.md`, `README.md`, `deploy/make-*.mjs`; `/workspace/reviews/release/*.md`; `/workspace/session/session-handoff-2026-08-28.md`, `green-roomz-system-requirements.md`; `data/smoke-models.json`. No invented filenames; **TBD** where size/hash unknown.

---

## 1. Model roles (aliases → known paths / names)

| Alias (role) | Known artifact name(s) from sources | Known path patterns | Size / hash (only if sourced) | Notes |
|---|---|---|---|---|
| **tool-router-agent** (resident nexus / JSON router) | `Qwenstral-Small-3.1-0.5B.Q4_K_M.gguf` | note9: `/data/local/tmp/grz/models/…`; android: `${GRZ_ROOT}/models/…`; windows-mvp: `${GRZ_ROOT}/models/…`; windows full: `C:\LocalAI\…` | **460616064** bytes (`session-handoff`); fleet-targets **432 MiB**; note9-termux **~439 MiB**; fetch-models `approxBytes: 398000000` | Only GGUF intended **resident on phone**. Port `:8187`, CPU. fetch-models URL currently points at bartowski **Qwen2.5-Coder-0.5B** while saving under the Qwenstral filename — treat as tip-script quirk / dogfood risk. |
| **general-text-speculator** (chat) | MVP: `Qwen2.5-0.5B-Instruct-Q4_K_M.gguf`; full windows: `Qwen3-4B-Q4_K_M.gguf` + draft `Qwen3-4B-eagle3-BF16.gguf` | MVP `${GRZ_ROOT}/models/…`; full `C:\LocalAI\…`; note9: `/data/local/tmp/grz/missing/text.gguf` (unavailable) | 0.5B Instruct: fetch-models **397808192** approx; fetch-tiny “~0.40 GB / ~398MB”. Qwen3-4B **sha256** `7485fe6f11af29433bc51cab58009521f205840f5b4ae3a32fa7f92e8534fdf5` (agents.windows.json). Eagle3 source_sha256 `58ac5bbfdd71047ebaa5d5535b895c2af37004eb820ca2dda55bd7666658853e`; converted GGUF hash **TBD**. | Phone: missing. MVP chat on CPU. Full host: 4B + optional EAGLE3. Optional sprint note: bartowski `Qwen2.5-1.5B-Instruct-Q4_K_M` **~986MB** when RAM free (windows-mvp notes). |
| **qwenstral-code-speculator** (code) | note9: `qwen2.5-coder-1.5b-instruct-q4_k_m.gguf`; windows full: `qwen2.5-coder-7b-instruct-q4_k_m.gguf` + draft `qwen2.5-coder-1.5b-instruct-q4_k_m.gguf`; MVP reuses Qwenstral 0.5B path | note9 models path; `C:\LocalAI\…`; MVP `${GRZ_ROOT}/models/Qwenstral-…` | **TBD** bytes | note9-sync lists 1.5B coder for push, but note9-termux policy keeps specialists unavailable/RAM-tight. |
| **vision-layout-agent** | `qwen2.5-vl-3b-instruct-q4_k_m.gguf` + projector `qwen2.5-vl-3b-mmproj-f16.gguf` | `C:\LocalAI\…`; note9 sync target under `/data/local/tmp/grz/models/` (manifest still `missing/vision.gguf`) | **TBD** | Requirements also name optional 7B VL quality profile — **no filename in tip configs**. Without model → clean **503** (`260db2a` lineage). |
| **semantic-embedding-agent** | **Divergence:** fetch-models → `nomic-embed-text-v1.5.Q4_K_M.gguf` (symlink alias `missing-embed.gguf`); windows full → `qwen3-embedding-0.6b-q8_0.gguf`; MVP → `missing-embed.gguf` | `./models` vs `C:\LocalAI` | fetch-models **~274 MB** approx; Qwen3 embed **TBD** | Operator must pick one lineage for the offline pack. |
| **retrieval-rerank-agent** | **Divergence:** fetch-models → `bge-reranker-base-q8_0.gguf` (URL file `ggml-model-q8_0.gguf`, symlink `missing-rerank.gguf`); windows full → `qwen3-reranker-0.6b-q8_0.gguf`; MVP → `missing-rerank.gguf` | same | fetch-models **~300 MB** approx; note9-sync skips corrupt reranker if `<1_000_000` bytes | Same lineage choice as embed. |
| **safety-policy-agent** (moderation) | **Divergence:** fetch-models → `Llama-Guard-3-1B-Q4_K_M.gguf` (symlink `missing-guard.gguf`); windows full → `qwen3guard-gen-0.6b-q4_k_m.gguf`; MVP/note9 → missing stubs | same | Llama-Guard fetch-models **~450 MB** approx; qwen3guard **TBD** | `deploy/make-moderation.mjs` calls `/v1/moderations` with model `safety-policy-agent` (no weights of its own). |
| **audio-transcription-agent** | `ggml-small.bin` (whisper) | `C:\LocalAI\whisper\models\…`; MVP `${GRZ_ROOT}/models/ggml-small.bin`; note9 missing stub | **TBD** | Needs whisper-server runtime (not a GGUF). |
| **speech-synthesis-agent** | `en_US-lessac-medium.onnx` (Piper) | `C:\LocalAI\piper\voices\…`; MVP `${GRZ_ROOT}/models/…`; note9 missing `voice.onnx` | **TBD** | Needs piper (or festival/flite engines from `a152bd0`); note9 piper runtime/model still missing per boards. |
| **image-generation-agent** | `sd15-q4_0.gguf` | `C:\LocalAI\stable-diffusion.cpp\models\…`; MVP/note9 missing stubs | **TBD** | Needs `sd-server.exe` / stable-diffusion.cpp (WINDOWS-MVP: model may exist, runtime often missing). |
| **security-monitor-agent** | no model file in manifests (`model: null`) | n/a | n/a | Policy/monitor alias — **not** a GGUF pack item. |
| **video-understanding-agent** (optional) | none in tip | n/a | n/a | Optional; out of ten required aliases. |

**Runtime packs (not weights, but required offline):**
- Windows CPU llama: b10702 install path (`WINDOWS-MVP.md`); historical Vulkan `llama-b10665-bin-win-vulkan-x64` on shalom (`session-handoff`, requirements).
- Android/Termux: `C:\LocalAI\android-pack\arm64-v8a` **~219 MB** → device `~/grz-runtime` (`note9-termux.md`).
- Unicorn: web/file-drop client (`scripts/unicorn.cmd` / `:8080/unicorn`) — accepts drops including `.gguf` types per handoff wish-list; not a model pack.

**fetch-models.mjs registry (tip `eb4a9f7`) — downloadable “one-click” set into `./models`:**

1. `Qwen2.5-0.5B-Instruct-Q4_K_M.gguf` → general-text (~397.8 MB approx)  
2. `Qwenstral-Small-3.1-0.5B.Q4_K_M.gguf` ← URL is Qwen2.5-Coder-0.5B (~398 MB approx)  
3. `nomic-embed-text-v1.5.Q4_K_M.gguf` (~274 MB)  
4. `bge-reranker-base-q8_0.gguf` (~300 MB)  
5. `Llama-Guard-3-1B-Q4_K_M.gguf` (~450 MB)  

Does **not** fetch vision, whisper, piper, SD, Qwen3-4B, coder 7B, or eagle3.

**note9-sync-models.ps1 push list** (from `C:\LocalAI` → `/data/local/tmp/grz/models`, SHA256 verified at push — hashes not pinned in script): Qwenstral 0.5B, coder 1.5B, VL 3B + mmproj, qwen3-embedding, qwen3guard, `ggml-small.bin`, Piper onnx, `sd15-q4_0.gguf` (+ size-gate on `qwen3-reranker-0.6b-q8_0.gguf`).

---

## 2. Size tiers: phone / mid laptop / strong desktop

| Tier | Hosts (fleet) | Hardware cue (sourced) | Pack intent | Resident / warm |
|---|---|---|---|---|
| **Phone** | **note9**, **pixel8** (pack “same”; pixel not pushed yet) | note9: SDM845, **5.7 GB** RAM, meas 0.5B tg32 **23.8** tok/s; pixel8: Tensor G3, 8 GB class, 0.5B **est** 20–40 tok/s | **Phone-min:** only `Qwenstral-Small-3.1-0.5B.Q4_K_M.gguf` + arm64 runtime (~219 MB). Specialists **not** resident. | tool-router only (`max_warm_specialists: 1`, admit refuse when tight) |
| **Mid laptop / weak PC** | **godslove** (i7-620M, **8 GB**, FreeBSD); **qodesh** (Athlon II, **16 GB**, but slow CPU **3.0** tok/s meas; GPU display-only) | 8–16 GB RAM; no/weak discrete accel for LLM | **MVP offline pack:** tool-router 0.5B + general-text `Qwen2.5-0.5B-Instruct-Q4_K_M` (+ optional 1.5B Instruct ~986MB). Embed/rerank/guard via fetch-models **or** leave missing. Vision/SD optional if disk allows; CPU llama only on qodesh. | router + at most one specialist; policy `responsive` |
| **Strong desktop / capable laptop** | **shalom** (Ryzen 5 7520U, **16 GB**, Vulkan 610M — keep Vulkan for **4B/7B**, CPU for 0.5B fleet worker **48** tok/s meas) | 16 GB+, Vulkan or strong CPU | **Full LocalAI-shaped pack:** windows.json artifacts (VL3B+mmproj, coder 7B+1.5B draft, Qwen3-4B+eagle3, qwen3 embed/rerank/guard, whisper, piper, sd15) **or** reconcile to fetch-models nomic/bge/Llama-Guard set. | `policy: maximize`, `max_warm_specialists: 2`; nexus still 0.5B CPU |

**Approx disk budgets (sum of known approx only — incomplete):**
- Phone-min weights: ~0.44 GB (Qwenstral measured) + runtime ~0.22 GB.  
- fetch-models five-file set: ~397+398+274+300+450 MB ≈ **~1.8 GB** approx (tip script).  
- Full specialist set: **TBD** (VL/coder7B/4B/eagle3/whisper/piper/sd sizes not pinned in tip scripts).

---

## 3. Offline pack layout proposal

Root idea from `docs/deployment.md` + manifests: **model store separate from git tree**; checksum at sync time (`note9-sync-models.ps1` pattern). Do not invent new basenames.

```text
<OFFLINE_ROOT>/                          # e.g. D:\GreenRoomz-Pack or USB volume (exFAT/NTFS if >4GB files)
  MANIFEST.md                            # this inventory + tip SHA eb4a9f7
  checksums.sha256                       # generate with sha256sum/Get-FileHash — pin only measured files; TBD until filled
  runtime/
    windows-cpu/                         # b10702 (or documented install) — exact tree TBD from installer
    windows-vulkan/                      # optional shalom: llama-b10665… — TBD copy
    android-arm64/                       # from LocalAI android-pack arm64-v8a (~219 MB)
  models/
    phone-min/
      Qwenstral-Small-3.1-0.5B.Q4_K_M.gguf
    mvp/                                 # aligns with agents.windows-mvp + fetch-tiny + fetch-models
      Qwenstral-Small-3.1-0.5B.Q4_K_M.gguf
      Qwen2.5-0.5B-Instruct-Q4_K_M.gguf
      nomic-embed-text-v1.5.Q4_K_M.gguf      # if choosing fetch-models lineage
      bge-reranker-base-q8_0.gguf            # if choosing fetch-models lineage
      Llama-Guard-3-1B-Q4_K_M.gguf           # if choosing fetch-models lineage
      # optional: Qwen2.5-1.5B-Instruct-Q4_K_M.gguf  (~986MB) — filename from mvp notes
    full-localai/                        # aligns with agents.windows.json / note9-sync sources
      Qwenstral-Small-3.1-0.5B.Q4_K_M.gguf
      Qwen3-4B-Q4_K_M.gguf
      Qwen3-4B-eagle3-BF16.gguf              # converted; hash TBD
      qwen2.5-coder-7b-instruct-q4_k_m.gguf
      qwen2.5-coder-1.5b-instruct-q4_k_m.gguf
      qwen2.5-vl-3b-instruct-q4_k_m.gguf
      qwen2.5-vl-3b-mmproj-f16.gguf
      qwen3-embedding-0.6b-q8_0.gguf
      qwen3-reranker-0.6b-q8_0.gguf
      qwen3guard-gen-0.6b-q4_k_m.gguf
      ggml-small.bin
      en_US-lessac-medium.onnx
      sd15-q4_0.gguf
  media-runtimes/                        # whisper-server, piper, sd-server — paths TBD per host
  scripts/                               # copies of fetch-models.mjs, note9-sync-models.ps1, fetch-tiny-instruct.cmd
```

**Host mapping (no new names):**
| Host | Manifest | Models root |
|---|---|---|
| note9 | `config/agents.note9.json` | drop zone `/data/local/tmp/grz/models`; exec `~/grz-runtime`; JS `~/green-roomz` |
| pixel8 | treat as android (`agents.android.json`) until dedicated manifest | `${GRZ_ROOT}/models` — **TBD** on device |
| qodesh | `agents.windows-mvp.json` | `%LOCALAPPDATA%\Green-Roomz\models` and/or `C:\LocalAI` (CPU only) |
| shalom | `agents.windows.json` | `C:\LocalAI` model store |
| godslove | **TBD** FreeBSD paths | likely CPU mmap of mvp/ or subset of full — operator choose |

**Checksums:**  
- Pin known: `Qwen3-4B-Q4_K_M.gguf` sha256 `7485fe6f…fdf5`.  
- All others: **TBD** — fill via `Get-FileHash` / `sha256sum` when copying from live LocalAI (note9-sync already verifies equality after adb push).  
- Reject junk: never treat **&lt;10KB** (handoff) or fetch-tiny **&lt;100MB** as real 0.5B weights; note9-sync skips reranker **&lt;1MB**.

---

## 4. Gaps / operator questions

1. **Canonical embed/rerank/guard lineage?** Tip `fetch-models.mjs` (nomic + bge + Llama-Guard-3-1B) vs `agents.windows.json` / note9-sync (qwen3-embedding / qwen3-reranker / qwen3guard). Offline pack cannot ship both as “the” safety stack without a decision.  
2. **Qwenstral filename vs Coder URL** in `fetch-models.mjs` — keep historical LocalAI `Qwenstral-Small-3.1-0.5B.Q4_K_M.gguf` bytes (460616064) or re-fetch tip URL into that name?  
3. **Phone policy vs note9-sync list:** sync script can push VL/coder/embed/etc., but termux doc + release boards say **router-only resident**. Confirm: offline workstation holds full set; phones only pull phone-min?  
4. **pixel8:** “same pack; not pushed” — confirm Termux vs KernelSU sidecar layout and models path.  
5. **godslove:** FreeBSD install media exists; which manifest and llama binary build?  
6. **Byte sizes / sha256** for VL3B, mmproj, coder 7B/1.5B, eagle3 GGUF, whisper small, piper onnx, sd15, qwen3-* — not in tip scripts; need LocalAI inventory pass on shalom/qodesh.  
7. **EAGLE3:** conversion recipe pinned; converted artifact hash **TBD**; target-only 4B must remain usable if draft absent.  
8. **Security workstation role:** is the offline box **shalom** (Vulkan full), a USB pack consumed by qodesh MVP, or a new disk image? McAfee exclusions mention `C:\LocalAI` on shalom.  
9. **Piper on note9:** boards still mark piper runtime/model missing despite TTS commits on main.  
10. **Unicorn dogfood** on tip already owns fetch-models — who fills `checksums.sha256` for the first sealed USB/offline pack?

---

## Tier table summary

| Tier | Hosts | Must-have weights | Nice-to-have | Explicitly exclude on device |
|---|---|---|---|---|
| **Phone** | note9, pixel8 | `Qwenstral-Small-3.1-0.5B.Q4_K_M.gguf` + arm64 runtime | — | 4B/7B/VL/SD concurrent resident; GGUF on phone beyond router |
| **Mid** | qodesh, godslove | router 0.5B + `Qwen2.5-0.5B-Instruct-Q4_K_M.gguf` | fetch-models embed/rerank/guard; optional 1.5B Instruct | qodesh: any GGUF on 8600 GT |
| **Strong** | shalom (+ offline security workstation role) | full `C:\LocalAI`-shaped set in §1 windows.json column | EAGLE3 draft if gated; VL+mmproj; whisper/piper/sd + runtimes | Do not confuse with phone-min layout |

**Report path:** `/workspace/reviews/release/MODEL-PACK-INVENTORY-2026-09-12.md`
