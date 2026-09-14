# sm11-monitor

CUDA **6.5 / sm_1.1** security-monitor hot-path assist for qodesh **GeForce 8600 GT**.

Proves the GPU can do mailbox/monitor floor work without listing models (**GPU MUST NOT list**):

| Kernel / helper | Spec tie-in |
|---|---|
| device **copy** + **cmp** | private slot / F3–F21 (one copy engine on 8600); device mismatch count |
| **FNV-1a** (+ batch of N envelopes) | fat-payload hash assist |
| **seq `{hi,lo}`** stamp | logical 64-bit seq on sm_1.1 (matches `ids.mjs` `u64Inc`) |
| ring **scrub** (zero / XOR) | clear or mask private-slot bytes |
| **private-slot ring** (16–64 × env_bytes) | host 32-bit index; H2D→device copy into slot; stamp seq; hash; scrub on drop |

Host owns the 32-bit lock-free ring index; GPU assists hash/copy/scrub/cmp/seq only (**GPU MUST NOT list**). No replica quorum here. Place / respond / logger launches stay off CUDA.

## Build (qodesh)

Requires:

- Visual Studio **2013** (`VC\vcvarsall.bat`)
- CUDA Toolkit **6.5** (`nvcc` 6.5)

```bat
native\sm11-monitor\build.bat
```

Output: `native\sm11-monitor\out\sm11_monitor.exe`

On qodesh, VS2013 has no native amd64 `vcvars64.bat`, so the script falls back to **Win32** (`-m32`) — verified on GeForce 8600 GT.

## Run

```bat
native\sm11-monitor\out\sm11_monitor.exe
native\sm11-monitor\out\sm11_monitor.exe some-payload
native\sm11-monitor\out\sm11_monitor.exe --json
native\sm11-monitor\out\sm11_monitor.exe --copy --hash
native\sm11-monitor\out\sm11_monitor.exe --scrub --seq --batch 64 --env-bytes 256
native\sm11-monitor\out\sm11_monitor.exe --json --copy --hash --loops 20
native\sm11-monitor\out\sm11_monitor.exe --json --ring-push --ring-slots 32 --env-bytes 64
native\sm11-monitor\out\sm11_monitor.exe --serve
```

Flags:

- `--json` — machine-readable one-line JSON
- `--copy` / `--hash` / `--scrub` / `--seq` — run only those probes (default: all)
- `--ring-push` / `--ring-hash` / `--ring-scrub` — fixed private-slot ring ops (host index; GPU assist)
- `--ring-slots N` — ring capacity (default 32, range 16..64)
- `--ring-slot I` — target slot for hash/scrub (default: last push / tail drop)
- `--batch N` — envelope count for batch hash / seq sample (default 64, max 4096)
- `--env-bytes B` — bytes per envelope for batch/scrub/ring (default 256, max 4096)
- `--loops N` — repeat probes in-process; JSON adds `ms_min` / `ms_avg` / `ms_max` / `loop_fail`
- `--serve` — keep CUDA context + ring warm; each stdin line is a CLI arg list; one JSON reply per line; `quit` ends

Expect text like `copy_ok=1 hash_ok=1` and `device0=GeForce 8600 GT sm_11`, plus `scrub_ok=1` / `seq_ok=1` / `cmp_ok=1` / `ring_ok=1` when those probes run.

**Live proof (qodesh):** `copy_ok=1 hash_ok=1 cmp_ok=1 scrub_ok=1 seq_ok=1 ring_ok=1` on the 8600 GT with CUDA 6.5 / sm_11.

## Stress / latency (qodesh, 2026-09-14)

Cold **process spawn** dominates (~100 ms). In-process reuse is an order of magnitude warmer.

### Cold spawn (50× each mode, 0 failures)

| Mode | min ms | p50 ms | avg ms | p95 ms | max ms |
|---|---:|---:|---:|---:|---:|
| `--json` (all) | 104 | 109 | 123 | 141 | 582 |
| `--json --copy --hash` | 100 | 107 | 109 | 127 | 137 |
| `--json --scrub` | 95 | 105 | 160 | 379 | 1344 |
| `--json --seq` | 96 | 105 | 161 | 347 | 1154 |
| `--json --hash --batch 256 --env-bytes 512` | 101 | 109 | 120 | 198 | 280 |

Occasional multi-second outliers on scrub/seq are driver/context hiccups under cold spawn — not kernel correctness flakes (`loop_fail=0` in-process).

### In-process `--loops` / `--serve` (warm CUDA context)

| Path | Result |
|---|---|
| `--json --copy --hash --loops 20` | `loop_fail=0`, `ms_min≈5.7`, `ms_avg≈12.8`, `ms_max≈61` |
| `--json --loops 20` (all probes) | `loop_fail=0`, `ms_min≈9.3`, `ms_avg≈18.7`, `ms_max≈71` |
| `--serve` then `--json --scrub --batch 8 --env-bytes 64` | ≈1.6 ms |
| `--serve` then `--json --seq --batch 8` | ≈2.2 ms |
| `--serve` then `--json --ring-push --ring-slots 16 --env-bytes 64` | first ≈38 ms (alloc); follow-ups ≈0.37–0.45 ms |
| `--serve` then `--json --ring-hash --ring-slot 1` | ≈1.1 ms |
| `--serve` then `--json --ring-scrub` | ≈0.14 ms |
| `--serve` then `--json --ring-push … --loops 20` | `loop_fail=0`, `ms_avg≈0.42`, `ms_max≈0.68` |

**Implication:** mailbox/monitor hot path must prefer `--serve` (or another persistent bridge). Per-op spawn cannot carry load. The private-slot ring stays resident across serve commands (host index; GPU never lists).

## Node wiring

`src/monitor/sm11-gpu.mjs` spawns this exe with `--json` probes and falls back to CPU FNV-1a when the exe is missing or CUDA fails.

### When is Mailbox / MonitorIpc sm11 enabled?

| Surface | Default | Enable | Disable |
| --- | --- | --- | --- |
| **Mailbox** | off | `GRZ_SM11=1` **or** `{ sm11: true }` / `{ sm11: {…} }` | `GRZ_SM11=0` or `{ sm11: false }` |
| **MonitorIpc** | assist object auto-wired (quiet) | `GRZ_SM11=1` turns on fat verify + hot path; or pass `{ sm11: {…} }` | `GRZ_SM11=0` or `{ sm11: false }` |
| **Logger** | same as Mailbox (explicit) | `GRZ_SM11=1` / `{ sm11: true }` | `GRZ_SM11=0` / `{ sm11: false }` |

### When is `preferRing` on?

- **Default on** whenever assist opens a persistent `--serve` session (exe present, `preferGpu` not false, `serve` not false). That is the normal `GRZ_SM11=1` / `{ sm11: true }` path when `out/sm11_monitor.exe` exists.
- Explicit `{ preferRing: true|false }` always wins.
- Without a serve session (no exe / `serve: false` / `preferGpu: false`), `preferRing` stays off and the hot path uses seq/scrub/batch probes only (CPU twin OK).

### Hot path (when enabled via `verifyOnFat` / `hotPath`)

- With `preferRing` / `--serve`: enqueue → `assistRingPush`, drop/clear → `assistRingScrub`, drain → `assistRingHash`.
- On ring failure → fall back to `assistSeq` / `assistScrub` / `assistBatch` (coalesced, non-blocking; CPU twin OK).
- Fat string payloads still store **sha256**; FNV-1a is the sm11 integrity twin / GPU probe.
- Private-slot ring assists also available directly: `assistRingPush` / `assistRingHash` / `assistRingScrub`.

```bat
set GRZ_SM11=1
node --test test/monitor-sm11-gpu.test.mjs
```

## N-API / node-gyp spike (#17) — blocked; keep `--serve`

Spike (qodesh, 2026-09-14, ~45 min): is a tiny **node-gyp / N-API** addon that links CUDA 6.5 and calls `cudaGetDeviceProperties` realistic next to this Win32 `sm11_monitor.exe`?

**Decision: no.** Keep the persistent **`--serve` stdin protocol** already wired in `src/monitor/sm11-gpu.mjs`. Do not scaffold `native/sm11-napi/`.

### Exact blockers (this box)

| # | Blocker | Evidence |
|---|---|---|
| 1 | **Arch mismatch** | Live `out\sm11_monitor.exe` is **Win32** (`PE machine=0x014C`). Node is **x64** (`process.arch=x64`, `C:\Program Files\nodejs`, engines `>=22`). A Win32 `.node` cannot load into x64 Node. |
| 2 | **x64 CUDA host link broken** | `nvcc -m64 -arch=sm_11 -ccbin …\x86_amd64` fails: `vcvars64.bat could not be found` under VS2013. Only `x86` + `x86_amd64` cross exist; no `VC\bin\amd64`, no `vcvars64.bat`. `build.bat` already falls back to `-m32`. CUDA 6.5 ships both `lib\Win32` and `lib\x64` cudart — x64 libs are unused because the host toolchain cannot finish an x64 link. |
| 3 | **node-gyp / Node 24 vs VS2013** | Node **v24.19.0** (N-API 10, `modules=137`). node-gyp for Node 24 expects **Visual Studio ≥ 2022**. VS2013 is only supported up to **Node 8**. This box has **only** VS 12.0 (no VS2015/2017/2019/2022; no `vswhere`). |
| 4 | **CUDA 6.5 host-compiler lock** | nvcc 6.5 accepts VS2013 as `-ccbin`. Installing VS2022 for node-gyp would not make nvcc 6.5 compile `.cu` with that newer cl; mixing VS2013 CUDA objs with a VS2022 N-API wrapper is an unsupported CRT/ABI mash-up even if bitness matched. |
| 5 | **No 32-bit Node escape hatch** | Only x64 Node is installed. Official Node 24 Windows builds are x64-focused; pinning a 32-bit Node just to dlopen a Win32 CUDA addon is out of bar vs warm `--serve`. |

### What was already measured (makes N-API unnecessary for the hot path)

Cold spawn ≈ **100 ms**; `--serve` warm probes ≈ **1.6–2.2 ms**. Spawn dominated CUDA work; persistent stdin already removes that cost without an in-process addon.

### Recommendation

- **Ship / keep:** long-lived `sm11_monitor.exe --serve` + JSON line protocol (CPU fallback unchanged).
- **Do not:** invest in `native/sm11-napi`, dual-toolchain node-gyp, or a 32-bit Node sideload for the 8600.
- Revisit only if this box gains a real **amd64** VS2013 layout (`vcvars64.bat`) *and* a supported path to build x64 sm_11 objs that a current Node can load — unlikely without dropping CUDA 6.5 or Node 24.

## ggml / LLM offload spike (optional, blocked)

Tried only as a short spike. **Prefer monitor path** — monitor alone makes the 8600 useful (#13).

Blockers for a tiny ggml-cuda sm_1.1 experiment under CUDA **6.5** + **VS2013**:

- Current ggml / llama.cpp CUDA backends expect modern CUDA (12.x-class toolchains) and VS2019+; they do not target `sm_11`.
- nvcc 6.5 still builds `sm_11` but warns architectures are deprecated; host compiler is VS2013-only on this box (no `vcvars64.bat`).
- Even a 0.5B Q4 weight exceeds **256 MB** VRAM once runtime buffers are counted; partial offload is a separate research track (#14), not the usefulness bar.

Do not invest multi-day effort here until a frozen, ancient ggml CUDA snapshot is deliberately vendored — out of bar for “most of security-monitor on 8600.”

## Ship bar

Landing this class of kernels and wiring monitor/mailbox hash+copy+scrub+seq through them (warm `--serve` under load) is enough to call the 8600 **useful**. See `docs/fleet-targets.md` and GitHub issue #13.
