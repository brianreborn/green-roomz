# Model lifecycle: start / stop / freeze / thaw

Measured on SHALOM (Ryzen 5 7520U, 8 logical, Radeon 610M UMA, NVMe), llama.cpp
b10665, `--load-mode mmap`.

## Measured overhead

| Model | first-ever cold (disk + warm-up) | **page-cache-hot restart** (`--no-warmup`) | stop (SIGTERM→exit) |
|---|---|---|---|
| tool-router 0.5B Q4 (CPU) | ~2.5 s | **1.6 s** | 0.1 s |
| general-text 4B Q4 (CPU, 8k ctx q8 KV) | ~17 s | **4.0–4.8 s** | 0.7 s |
| code 7B Q4 (CPU) | ~35 s | ~6–8 s (est) | ~1 s |
| vision 3B Q4 + mmproj (CPU) | ~30 s | ~4–6 s (est) | ~0.7 s |
| whisper small | ~7 s | ~4 s (est) | fast |
| sd-server SD1.5 | ~15–18 s to listen | similar | fast |

Two facts drive this:

1. **`--load-mode mmap` + the OS page cache is already a persistent shared pool
   for weights.** The GGUF is mapped read-only; every process that maps the same
   file shares the same physical pages; the pages survive process exit (they stay
   in the page cache until evicted under pressure). That is why a restart is
   ~4 s, not ~17 s. **Do not `drop_caches`.** Weights are ~70 % of a model's
   footprint and this part needs no further work.
2. Warm-up (an empty forward pass) costs ~0.5–1 s and only moves the graph-build
   cost from "first request" to "startup". Evictable specialists now launch with
   `--no-warmup` (report ready sooner); the resident nexus keeps warm-up.

## Freeze / thaw — what green-roomz does

`ProcessManager` classifies an eviction:

- **Over the warm ceiling only** (memory is fine): **SIGSTOP** the LRU
  CPU-backed model. Execution freezes; the process keeps every mapping. The OS
  pages its now-idle anonymous memory (KV cache, buffers) out to swap under
  pressure and back in on **SIGCONT**. Revive is a signal — **< 0.2 s**, KV
  preserved. POSIX only (`gateway.suspend_evicted`); Windows terminates.
- **Actually short on memory**, or a GPU/dGPU model, or Windows: **terminate**
  and wait for the port to free, then cold-start (which is now ~4 s hot).

`sweepIdle` freezes merely-idle models and terminates long-idle / over-cap ones.

## GPU models — making revive fast

SIGSTOP does not free VRAM (driver-pinned), **except on a UMA APU** where "VRAM"
is host RAM allocated `HOST_VISIBLE` — there SIGSTOP can work like CPU. On a
discrete GPU:

1. **Persistent shader/pipeline cache** — set the driver's cache dir so
   ggml-vulkan does not recompile shaders on every cold start (biggest single
   cold-start cost after weights). Env, not code.
2. **KV on host** (`--no-kv-offload`) for evictable GPU models → the large
   dynamic allocation becomes pageable / suspendable even while weights are on
   the GPU.
3. **`--no-warmup`** (already default for specialists).
4. Keep the GGUF page-cache hot.

Together these bring a ~30 s GPU cold start toward ~5–8 s.

### GPU-yield protocol (needs a llama.cpp patch — not built)

The clean design: a signal (`SIGUSR1`) tells the worker to `vkFreeMemory` its
weight + KV buffers and set a "reacquire lazily" flag; it confirms (control
socket or a health field); then it is SIGSTOP-able with VRAM released. On the
next request it re-uploads.

Estimated latency:

| | dGPU (weights kept in host RAM) | UMA / APU |
|---|---|---|
| signal → VRAM released | 0.5–2 s (device→host copy) | ~0 |
| confirm | 50–200 ms poll | 50–200 ms |
| SIGSTOP | < 10 ms | < 10 ms |
| SIGCONT → reacquire on first infer | 0.5–2 s (host→device) | ~0.1 s |
| **freeze / thaw round trip** | **~1–3 s** | **< 0.5 s** |
| vs. full cold start | 20–40 s | 15–30 s |

`ggml_backend_buffer` already abstracts allocation, so the patch is bounded but
real. Until then: terminate + fast hot cold-start, or pin a dGPU model warm.

## "Global mmap pool" for the dynamic state (analysis)

Backing KV cache / compute buffers with `mmap`'d files from one pool, so they
persist across process exit without an explicit dump:

- **Weights**: already this (GGUF mmap). Nothing to add.
- **KV + buffers**: would need a ggml CPU-backend allocator patch to `mmap` a
  pool file instead of `malloc`. On a **tmpfs / ramdisk** file it is real RAM
  with no disk I/O, and the pages survive the process → a restart skips KV
  realloc/recompute (~1–2 s for the 4B). Marginal on top of the 4 s hot restart;
  meaningful only if you want < 2 s restarts and are not using SIGSTOP.
- Different models have different tensor shapes, so there is no cross-model
  sharing — it is "one persistent arena per model in a shared file", partitioned
  by model, not shared memory. Concurrency is rare on a 1-warm box (the
  "probabilistic" case), but two concurrent models need disjoint regions.
- **SIGSTOP + swap already is this**, implicitly and per-process: the frozen
  process's dirty KV pages go to swap and come back on resume. An explicit pool
  only wins if you also want the state to outlive a *terminate* (not just a
  freeze) — e.g. survive a gateway crash/restart.
- **Monitor exclusion**: the security-monitor model (if it ever loads real
  weights) stays out of any such pool and is `mlock`'d — its in-memory state
  must never touch disk. Honoured by keeping it `resident` + non-evictable.

**Verdict**: the high-value pieces (weights mmap, page cache, `--no-warmup`,
SIGSTOP for CPU) are in. A tmpfs KV arena is a real but small further win behind
a ggml patch; the GPU-yield protocol is the bigger prize for dGPU hosts.

## Disk-backed KV — named checkpoints, warm-start, rollback

Swap is opaque and ephemeral: you can't name a snapshot, roll back, or warm-start
a fresh process from a prior state. **Disk-backed model memory** gives all of
that, and llama.cpp already implements it at the application level — no MMU games,
works on Windows too.

`--slot-save-path <dir>` enables:

| endpoint | effect |
|---|---|
| `POST /slots/0?action=save`  `{"filename":"tag.bin"}` | dump the slot's KV cache to a named file |
| `POST /slots/0?action=restore` `{"filename":"tag.bin"}` | load it back into a running slot |
| `--cache-idle-slots` | auto-spill an idle slot to the prompt cache when a new task arrives |
| `--slot-prompt-similarity` | reuse a slot whose prompt prefix matches the request |

**Live-measured (0.5B, small ctx):** save 200 in **24 ms** → 2.46 MB file;
restore in **5 ms**. A 4B/7B at full 8k context is a few hundred MB → save/restore
is disk-bound (~0.5–2 s) but still far cheaper than recomputing the KV.

green-roomz wires this into the state model it already has (`gateway.checkpoint_dir`
or `GREEN_ROOMZ_CHECKPOINT_DIR`):

- every `llama_server` launches with `--slot-save-path <dir>/<alias>/` + `--cache-idle-slots`
- `ProcessManager.checkpointModel(alias, tag)` / `restoreModel(alias, file)`
- **terminate-eviction checkpoints first** — `stop()` saves `on-stop.bin` before
  SIGTERM, so a terminated model is not a lost conversation
- `checkpoint_keep` (default 3) bounds retained snapshots per model
- warm-start a fresh process from any snapshot; roll back to an older one

This is strictly better than swap for durability: a checkpoint survives a
terminate, a gateway crash, or a move to another host - swap does not.

## "Every model loaded, disk-backed" + a shared GPU pool

### CPU side — this is just overcommit + swap, and it works today

Start every model process; total virtual > physical RAM; a large swapfile backs
the difference. Idle models' pages age out to swap on their own; a request to a
cold model page-faults them back (~1–2 s for a few hundred MB of KV from NVMe;
weights re-fault from the GGUF page cache, fast).

There is **no page-inconsistency problem to solve**. Demand paging is already
consistent: the MMU faults on any not-present page, the OS fault handler brings
the correct version in and serializes concurrent faults, then the instruction
retries. You do not need explicit MMU/CPU locking for this — that is what the
fault path *is*. The one place you *do* want pinning is `mlock()` on the monitor
model so its state can never reach disk.

green-roomz's SIGSTOP is the disciplined form of the same thing: freeze the idle
model (so it is not scheduled and holds no CPU), let its pages age out, SIGCONT
to thaw. You could skip SIGSTOP and just run everything with a big swapfile — the
warm ceiling + LRU still bound thrash — but a frozen process is cleaner (no
background threads, resident set shrinks fully).

### GPU side — the driver already has the "trade off" mechanism, llama.cpp just doesn't use it

A dGPU with a large VRAM pool *can* let several model processes overcommit it and
page the idle ones to host RAM automatically — via:

- **CUDA / HIP managed memory** (`cudaMallocManaged` / `hipMallocManaged`): pages
  migrate device↔host on access fault, driven by the GPU MMU. An idle model's
  weights drift to host RAM under VRAM pressure and back on use. Lazy, per-page.
- **`VK_EXT_pageable_device_local_memory`** (Vulkan, newer, NVIDIA + some): the
  driver pages device-local memory to host under pressure.

ggml allocates plain device-local memory by default, so this needs a
build flag / small ggml patch. **With it, the user's design is close to free**:
start all GPU models, they allocate managed VRAM, the GPU driver trades the pool
off automatically. Cost is a host↔device migration (1–4 s over PCIe) only for the
pages a revived model actually touches. Under heavy thrash it can be
unpredictable — the explicit yield signal (above) is the disciplined fallback.

**On a UMA APU (shalom) there is no separate VRAM to trade** — one pool, so a
"GPU" model is a host allocation with GPU compute, and CPU-side SIGSTOP + swap
already covers it (buffers are `HOST_VISIBLE` on the `uma:1` path). The APU case
needs none of the dGPU machinery.
