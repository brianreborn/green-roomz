# CUDA 8600 GT streaming plan (qodesh) — copy/compute overlap, LLM on CPU

**Status:** architecture plan (docs only). Do **not** install drivers, do **not** stop live box serve, do **not** run long GPU stress, no Afterburner, no clock loops.  
**Card:** NVIDIA GeForce **8600 GT**, G84, **sm_1.1**, **224 MB**, Win32 CUDA **6.5** on **qodesh**.  
**Locked split:** GGUF / llama-server stay **CPU** (`--device none`). GPU is a **conv/GEMM + stream mailbox** coprocessor, never a weight home.

Companions: [`/workspace/cuda-research/qodesh-sm11.md`](../cuda-research/qodesh-sm11.md), [`8600gt-best-fit.md`](../cuda-research/8600gt-best-fit.md), [`fruitful-path.md`](../cuda-research/fruitful-path.md), [`security-monitor-requirements.md`](../cuda-research/security-monitor-requirements.md), live gate comments in [`green-roomz/src/monitor/gate.mjs`](../green-roomz/src/monitor/gate.mjs), Tesla-portable slot layout in [`green-roomz/src/monitor/ids.mjs`](../green-roomz/src/monitor/ids.mjs) (`SLOT_BYTES=16`, `packSlot` / `unpackSlot`), stub [`green-roomz/docs/gpu-mailbox-sm11.md`](../green-roomz/docs/gpu-mailbox-sm11.md).

Live serve (do not stop): box `e2e-fresh/green-roomz` node `:8080` + llama `:8187` CPU 0.5B — see [`cuda-research/LIVE.txt`](../cuda-research/LIVE.txt).

---

## 0. Vocabulary lock (sm_1.1)

| Term | Meaning on 8600 GT | Not meaning |
| --- | --- | --- |
| **Stream** | Ordered queue that can **overlap one H2D/D2H copy with one kernel** when `asyncEngineCount ≥ 1` | Concurrent CUDA kernels (Fermi+) |
| **Dual engines** | **Copy engine + compute engine** occupancy | Two kernels at once (`concurrentKernels` is **false** on sm_1.1) |
| **Mailbox** | Fixed power-of-two ring, **16-byte** aligned slots, 64-bit IDs as `{hi,lo}`, mapped pinned host memory, portable `post` | GGUF tensors, logger sink, Fortuna mixer |
| **Grade** | Small policy signal (`kind: grade`) workers/SAD `post`; host drain → policy | A respond verb launched as a CUDA kernel |

NVIDIA Programming Guide (v6.x) §3.2.5: overlap of memory copies with kernel execution on devices that report copy engines; concurrent kernels require CC **2.x+**. Treat every design decision as **copy∥compute**, never **kernel∥kernel**.

---

## 1. Concrete architecture — what runs where

```
┌──────────────────────────────────────────────────────────────────────┐
│ HOST (Athlon II X2)                                                  │
│  • llama-server --device none  (GGUF weights + KV + decode)           │
│  • green-roomz gateway :8080, security-monitor-agent (mailbox drain) │
│  • respond / isolate / place / logger / Fortuna / OS-NTP / sockets   │
│  • gate begin/end bookkeeping (host-side occupancy only)             │
│  • mapped pinned mailbox ring (producer post + broadcast drain)      │
└───────────────┬──────────────────────────────▲───────────────────────┘
                │ H2D work buf A/B             │ grades / seq posts
                │ (copy engine)                │ (mapped pin + 32-bit
                ▼                              │  atomic + fencefence
┌───────────────────────────────────────────────┴──────────────────────┐
│ DEVICE (8600 GT, 4 SM / 32 SP, 224 MB)                                │
│  SM compute engine: ONLY packed conv and/or tiled GEMM kernels        │
│  Copy engine:        H2D/D2H of work buffers (double-buffer)          │
│  Device DRAM:        work tiles + tiny private staging (≪ 224 MB)     │
│  MUST NOT on SMs:    respond, isolate, place, logger, Fortuna, NTP,   │
│                      sockets, resident SAD, GGUF weights, KV cache    │
└──────────────────────────────────────────────────────────────────────┘
```

### 1.1 On SM (compute engine) — yes

| Work | Source / pattern | Why it fits |
| --- | --- | --- |
| Separable convolution | CUDA 6.5 `convolutionSeparable` | 16 KB shared, FP32, saturates G8x |
| Tiled SGEMM | CUDA 6.5 `matrixMul` (block 16 on major&lt;2) | Guide §3.2.3 textbook sm_1.1 |
| Gate-wrapped packed pipeline | `gate.mjs` `GPU_KERNELS = ['conv','gemm']` | One packed worker at a time; no concurrentKernels |

Keep individual launches short enough for **WDDM TDR** (GeForce cannot use TCC). Prefer **one-shot** or short fixed iteration counts, not open-ended stress loops.

### 1.2 On host — yes (and stay there)

| Module | Why off-SM |
| --- | --- |
| LLM / GGUF | Weights alone (0.5B Q4 ≈ 439 MiB) exceed 224 MB; no sm_1.1 ggml-cuda |
| `respond` / `isolate` / `place` | Privileged / effectful; requirements §10 + `FORBIDDEN_CUDA_KERNELS` |
| `logger` | Append-only hash-chained sink; not the hot ring; fail-open on disk |
| Fortuna | CPU-only entropy mixer; mailbox carries credit/hash only |
| NTP | OS (`w32time`); never an SNTP thread on GPU |
| Sockets / network verbs | Kernel/driver / monitor network module |
| Mailbox **drain** / policy / vote | Broadcast drain + policy map live in Node/monitor |

### 1.3 Copy engine — reserved for work buffers, not mailbox spam

Locked in `gate.mjs`: **`copyEngineMailbox: false`** — MUST NOT burn the single 8600 async copy engine on mailbox copies.

| Traffic | Path |
| --- | --- |
| Conv/GEMM tiles H2D/D2H | `cudaMemcpyAsync` on a dedicated stream → **uses** copy engine |
| Grade / hop / observe posts | **Mapped pinned** host ring + global 32-bit atomic + `threadfence_system` (or host `memcpy` into a private slot) → **does not** steal the copy engine |
| Fat payloads | Hash on host (`sha256` / envelope rules); only hashes / `{hi,lo}` IDs on the ring |

PCIe 1.1 ≈ 1.3 GB/s theoretical; treat mailbox as **tiny** (16 B × power-of-two slots).

---

## 2. How green-roomz monitor mailbox maps to CUDA streams

### 2.1 Envelope (unchanged)

Producers speak the PQ-style envelope in `src/mailbox.mjs` / monitor IPC — not a GGUF:

`seq`, `kind`, `source`, `ticket`, `ts`, `payload`, `target`

On sm_1.1, unique IDs are **logical 64-bit** as `{hi, lo}` with **`lo` the ring atomic**. Ring index wrap is **occupancy**, never identity (`ids.mjs` `ringIndex32` vs `u64Eq`).

### 2.2 Tesla-portable 16-byte slot (already in memory)

From `src/monitor/ids.mjs`:

| Offset | Field | Notes |
| --- | --- | --- |
| 0..3 | `seq.lo` | Little-endian u32; **ring atomic** |
| 4..7 | `seq.hi` | Little-endian u32 |
| 8..11 | `ticket.lo` | Little-endian u32 |
| 12..15 | `ticket.hi` | Little-endian u32 |

`SLOT_BYTES = 16`, capacity `nextPow2`, default hot `HOT_RING_SLOTS = 256`, upcall `UPCALL_SLOTS = 16`. `packSlot` / `unpackSlot` are the portable binary view; live Node rings remain JS `CopyRing` (copy-only between monitors). The CUDA mapping is a **future site** of the same layout, not a second envelope dialect.

### 2.3 Stream ↔ mailbox roles

| CUDA stream | Role | Mailbox interaction |
| --- | --- | --- |
| `streamCompute` | Ordered conv/GEMM launches | On completion (host callback / event sync on host thread): `post({ kind: 'grade' \| 'observe', … })` into **mapped pinned** ring |
| `streamCopy` | Async H2D/D2H of double-buffer tiles | Never posts mailbox traffic; only moves work bytes |
| (optional) `streamNull` / default | One-shot SDK proofs | Same rules: no forbidden kernels |

**Mapping rule:** monitor **gate** `begin`/`end` bookend the packed GPU worker on the **host**. They MUST NOT wait on a vote. Grades produced after a batch land on the hot ring; upcalls use the small dedicated upcall ring so drop-oldest on hot cannot erase them.

```
host: gate.begin(conv|gemm)
  streamCopy:  H2D buf[i]
  streamCompute: kernel(buf[i])          // overlaps next H2D of buf[1-i] when dual-engine
  streamCopy:  D2H results[i]            // overlaps next kernel when scheduled like simpleStreams
host: event sync / callback
  mapped pin:  post(grade|observe)       // atomic on seq.lo; no copy-engine use
  Node drain:  broadcast listeners (policy / logger emit / HTTP recent — as today)
host: gate.end
```

Inter-monitor exchange stays **copy-only** (no shared heap between monitor replicas). The mapped pinned ring is the **GPU→host post** surface for one producer path, not a common monitor↔monitor shared mapping.

---

## 3. Double-buffer / simpleStreams pattern (grades vs host drain)

### 3.1 Work path (classic simpleStreams)

NVIDIA `0_Simple/simpleStreams` teaches the G8x-relevant pattern:

1. Allocate **two** (or N) pinned host staging buffers + two device buffers.  
2. For iteration `i`:  
   - `cudaMemcpyAsync` H2D `buf[i % 2]` on `streamCopy`  
   - Launch kernel on `buf[i % 2]` on `streamCompute`  
   - Optionally queue D2H of previous result on `streamCopy`  
3. Overlap comes from **copy engine busy while SM busy**, not from two kernels.

On sm_1.1 this is the **entire** concurrency story. Depth-2 is enough; deeper queues do not add concurrent kernels.

### 3.2 Grade path (orthogonal to tile copies)

| Stage | Mechanism |
| --- | --- |
| Produce | After kernel batch (or per tile if needed): pack 16 B slot (`seq`,`ticket`); store kind/source/ts/payload **hash** in a side table or host envelope rebuild |
| Post | Write slot into mapped pinned ring at `ringIndex32(seq)`; `atomicAdd`/`atomicCAS` on `seq.lo` occupancy; `threadfence_system` |
| Drain | Host poll / IOCP / `setImmediate` (existing Node drain) — **broadcast**, non-blocking push, drop-oldest on hot except upcall slots |
| Policy | Host `policy` maps grade → verb intent; **never** invoke respond from GPU |

Do **not** double-buffer grades through the copy engine. Double-buffer **tiles**; single mapped ring for **signals**.

### 3.3 Occupancy sketch (dual-engine)

```
time →
copy eng:  [H2D A][H2D B][D2H A][D2H B] ...
compute:      [kern A ][kern B ][kern A ] ...
host CPU:  llama decode ||||| drain grades / gateway |||||
```

Llama and GPU pipelines are **independent**. Do not stall llama waiting on GPU or idle GPU waiting on llama when both can run.

---

## 4. Dual-engine occupancy idea (what to measure)

1. Query once (deviceQuery already PASS): `asyncEngineCount`, `concurrentKernels` (expect **0**), totalGlobalMem (~224–256 MB reported), major/minor **1.1**.  
2. One-shot `simpleStreams` (or a tiny double-buffer vectorAdd variant): compare  
   - serial: copy then kernel then copy  
   - overlapped: streams as above  
3. Success metric: **wall time down** and/or copy∪kernel timeline showing overlap — **not** sustained wattage, not Afterburner clocks, not multi-minute loops.  
4. Keep working set well under 224 MB (deviceQuery headroom + WDDM framebuffer). Prefer matrix dims / image tiles in the few–tens of MB, not the full 108 MB conv default, for the **proof** shot.

---

## 5. What NOT to put on the card

| Forbidden | Reason |
| --- | --- |
| GGUF weights / KV / llama layers | VRAM + ISA; locked CPU-only |
| `respond` / `isolate` / `place` / `logger` / Fortuna / NTP / sockets / SAD as CUDA launches | Requirements §10; `FORBIDDEN_CUDA_KERNELS` |
| Mailbox copies via the async copy engine | Steals the only overlap resource; `copyEngineMailbox: false` |
| Concurrent-kernel designs / CUDA graphs / UVM / CDP | Need SM ≥ 2.0 / 3.0 / 3.5 |
| Afterburner / manual clocks / open stress loops | Thermal + TDR abuse; user lock |
| Vulkan / ggml-vulkan | Policy: CUDA only on qodesh |
| Driver / toolkit upgrades past 6.5-era stack | sm_1.1 removed in CUDA 7+ |
| Stopping live `:8080` / `:8187` to “free” the GPU | Explicit: live box serve must not be stopped |

---

## 6. Sample inventory (box research tree + qodesh status)

Research dir: **`/workspace/cuda-research`** (plans + build `.cmd` helpers).  
On-disk CUDA 6.5 samples (qodesh): `C:\LocalAI\_tmp\cuda65\CUDASamples\` and/or `C:\ProgramData\NVIDIA Corporation\CUDA Samples\v6.5\`.

| Sample | Tree status | qodesh run status (from HUD / research) | Role in this plan |
| --- | --- | --- | --- |
| **deviceQuery** | Present (`1_Utilities`); `build-deviceQuery.cmd` | **PASS** 2026-08-28 PT — 8600 GT, sm_1.1, CUDA 6.5, ~256 MB reported, 32 cores | Sanity only; do not re-stress |
| **vectorAdd** | Present under `0_Simple` (SM 1.1 on 6.5 tree) | Not ranked; not required for overlap proof | Optional tiny compute smoke; weak on copy overlap |
| **simpleStreams** | Present under `0_Simple` on 6.5 tree | **Not built/run** in research notes | **Best next one-shot** for copy∥compute |
| convolutionSeparable | Present; in `build-samples.cmd` | Build path incomplete (Express amd64 / spawn aborted historically) | Primary production load later |
| matrixMul | Present; in `build-samples.cmd` | Same | Primary GEMM load later |
| simpleMultiCopy | In `build-cuda-cycle.cmd` | Cycle script exists; multi-copy may need &gt;1 copy engine — **verify** `asyncEngineCount` before relying | Secondary; 8600 often has **one** copy engine |
| bandwidthTest | Present | Not run in HUD | Explains PCIe tax; optional later |

No separate `/workspace` checkout of NVIDIA sample **sources** beyond research docs; binaries live on qodesh’s CUDA Samples install/extract tree.

---

## 7. Proposed next one-shot sample (no thermal abuse)

**Pick: `0_Simple/simpleStreams` — single process run, default or reduced N, exit.**

| Constraint | How |
| --- | --- |
| Prove stream overlap / dual-engine | Compare default streams timing vs serialized baseline **once** |
| Not a loop | Do **not** wrap in `build-cuda-cycle`-style infinite reruns; one invocation |
| Not Afterburner | Stock clocks |
| Not LLM | No GGUF touch; leave `:8080`/`:8187` alone |
| Win32 CUDA 6.5 | Build with VS2013 v120 + `compute_11,sm_11` when toolchain ready; this doc does not install drivers or run the build |
| Fallback | If simpleStreams project missing on installed tree: a **tiny** custom one-shot — two `cudaMemcpyAsync` + one `vectorAdd`-class kernel on two streams, print ms, exit (header stub only if needed) |

**Do not** choose nbody, CDP, Unified Memory, or multi-minute convolution loops as the next proof.

**Defer:** production `convolutionSeparable` / `matrixMul` saturation until after the one-shot overlap proof and only with TDR-safe batch sizes.

---

## 8. Innovate list (GPU useful, LLM still CPU)

1. **Stream-overlapped preprocess:** host image/audio tiles → GPU separable conv → host features → CPU VL/0.5B (optional later pipeline from fruitful-path).  
2. **Grade telemetry from GPU gate:** each packed batch posts `{kind:'grade'|'observe'}` with hashed payload; monitor policy stays host.  
3. **Entropy credit from seq jitter:** Fortuna on CPU samples GPU `seq` timing credits (hash only on ring) — no Fortuna on SM.  
4. **Dual-buffer GEMM microbench:** matrixMul dims grown carefully under 224 MB with streams for H2D of next tile.  
5. **WDDM-friendly duty cycle:** short gated bursts between host idle, never a spin loop.  
6. **Portable post path:** same `packSlot` bytes on mapped pin as future PQFreeBSD MAC monitor — one layout, many sites.

---

## 9. Execution guardrails (this and next tasks)

- [ ] Do not stop live green-roomz / llama on the box.  
- [ ] Do not install or replace NVIDIA drivers / CUDA toolkit in doc-only tasks.  
- [ ] Do not load GGUF onto the 8600.  
- [ ] Do not launch forbidden kernels on SMs.  
- [ ] Do not use the copy engine for mailbox traffic.  
- [ ] Next GPU binary proof = **one-shot** simpleStreams (or tiny double-buffer), then stop.  
- [ ] Prefer writing plans/docs; code only as tiny header/comment stubs when clearly useful.

---

## 10. Deliverable paths

| Artifact | Path |
| --- | --- |
| **This plan** | `/workspace/reviews/cuda-8600-streaming-plan.md` |
| GPU mailbox stub | `/workspace/green-roomz/docs/gpu-mailbox-sm11.md` |
| Slot layout (source of truth) | `/workspace/green-roomz/src/monitor/ids.mjs` |
| Gate / forbidden list | `/workspace/green-roomz/src/monitor/gate.mjs` |

## Measured (2026-09-06 qodesh)

`simpleStreams.exe` Win32 Release one-shot: memcopy 47.11 ms | kernel 65.77 | non-streamed 112.98 | 4 streams **80.05** → copy∥compute overlap. deviceQuery: Concurrent copy and kernel execution Yes, **1** copy engine. Toolkit V6.5.16.
