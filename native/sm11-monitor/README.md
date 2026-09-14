# sm11-monitor

CUDA **6.5 / sm_1.1** security-monitor hot-path assist for qodesh **GeForce 8600 GT**.

Proves the GPU can do mailbox/monitor floor work without listing models (**GPU MUST NOT list**):

| Kernel / helper | Spec tie-in |
|---|---|
| device **copy** + **cmp** | private slot / F3–F21 (one copy engine on 8600); device mismatch count |
| **FNV-1a** (+ batch of N envelopes) | fat-payload hash assist |
| **seq `{hi,lo}`** stamp | logical 64-bit seq on sm_1.1 (matches `ids.mjs` `u64Inc`) |
| ring **scrub** (zero / XOR) | clear or mask private-slot bytes |

Host may own the 32-bit lock-free ring; GPU assists hash/copy/scrub/seq only. No replica quorum here. Place / respond / logger launches stay off CUDA.

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
native\sm11-monitor\out\sm11_monitor.exe --serve
```

Flags:

- `--json` — machine-readable one-line JSON
- `--copy` / `--hash` / `--scrub` / `--seq` — run only those probes (default: all)
- `--batch N` — envelope count for batch hash / seq sample (default 64, max 4096)
- `--env-bytes B` — bytes per envelope for batch/scrub (default 256, max 4096)
- `--loops N` — repeat probes in-process; JSON adds `ms_min` / `ms_avg` / `ms_max` / `loop_fail`
- `--serve` — keep CUDA context warm; each stdin line is a CLI arg list; one JSON reply per line; `quit` ends

Expect text like `copy_ok=1 hash_ok=1` and `device0=GeForce 8600 GT sm_11`, plus `scrub_ok=1` / `seq_ok=1` / `cmp_ok=1` when those probes run.

**Live proof (qodesh):** `copy_ok=1 hash_ok=1 cmp_ok=1 scrub_ok=1 seq_ok=1` on the 8600 GT with CUDA 6.5 / sm_11.

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

**Implication:** mailbox/monitor hot path must prefer `--serve` (or another persistent bridge). Per-op spawn cannot carry load.

## Node wiring

`src/monitor/sm11-gpu.mjs` spawns this exe with `--json` probes and falls back to CPU FNV-1a when the exe is missing or CUDA fails.

- Default assist opens a persistent `--serve` session when the exe is present (`serve: false` to force one-shot).
- `MonitorIpc` / `Mailbox` auto-wire assists (`GRZ_SM11=0` disables; `GRZ_SM11=1` enables fat verify + hot-path scrub/seq/batch).
- Hot path (when enabled): enqueue → `assistSeq`, ring drop/clear → `assistScrub`, drain → `assistBatch` (coalesced, non-blocking).
- Fat string payloads still store **sha256**; FNV-1a is the sm11 integrity twin / GPU probe.

```bat
set GRZ_SM11=1
node --test test/monitor-sm11-gpu.test.mjs
```

## ggml / LLM offload spike (optional, blocked)

Tried only as a short spike. **Prefer monitor path** — monitor alone makes the 8600 useful (#13).

Blockers for a tiny ggml-cuda sm_1.1 experiment under CUDA **6.5** + **VS2013**:

- Current ggml / llama.cpp CUDA backends expect modern CUDA (12.x-class toolchains) and VS2019+; they do not target `sm_11`.
- nvcc 6.5 still builds `sm_11` but warns architectures are deprecated; host compiler is VS2013-only on this box (no `vcvars64.bat`).
- Even a 0.5B Q4 weight exceeds **256 MB** VRAM once runtime buffers are counted; partial offload is a separate research track (#14), not the usefulness bar.

Do not invest multi-day effort here until a frozen, ancient ggml CUDA snapshot is deliberately vendored — out of bar for “most of security-monitor on 8600.”

## Ship bar

Landing this class of kernels and wiring monitor/mailbox hash+copy+scrub+seq through them (warm `--serve` under load) is enough to call the 8600 **useful**. See `docs/fleet-targets.md` and GitHub issue #13.
