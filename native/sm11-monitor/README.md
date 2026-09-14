# sm11-monitor

CUDA **6.5 / sm_1.1** security-monitor hot-path assist for qodesh **GeForce 8600 GT**.

Proves the GPU can do mailbox/monitor floor work without listing models (**GPU MUST NOT list**):

| Kernel / helper | Spec tie-in |
|---|---|
| device **copy** | private slot / F3–F21 (one copy engine on 8600) |
| **FNV-1a** (+ batch of N envelopes) | fat-payload hash assist |
| **seq `{hi,lo}`** stamp | logical 64-bit seq on sm_1.1 (matches `ids.mjs` `u64Inc`) |
| ring **scrub** (zero / XOR) | clear or mask private-slot bytes |

Host may own the 32-bit lock-free ring; GPU assists hash/copy/scrub/seq only. No replica quorum here.

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
```

Flags:

- `--json` — machine-readable one-line JSON
- `--copy` / `--hash` / `--scrub` / `--seq` — run only those probes (default: all)
- `--batch N` — envelope count for batch hash / seq sample (default 64, max 4096)
- `--env-bytes B` — bytes per envelope for batch/scrub (default 256, max 4096)

Expect text like `copy_ok=1 hash_ok=1` and `device0=GeForce 8600 GT sm_11`, plus `scrub_ok=1` / `seq_ok=1` when those probes run.

**Live proof (qodesh):** `copy_ok=1 hash_ok=1` on the 8600 GT with CUDA 6.5 / sm_11.

## Node wiring

`src/monitor/sm11-gpu.mjs` spawns this exe with `--json --copy --hash` and falls back to CPU FNV-1a when the exe is missing or CUDA fails.

- `MonitorIpc` auto-wires the assist (set `GRZ_SM11=0` to disable; `GRZ_SM11=1` also verifies fat payloads on push via CUDA).
- `Mailbox` opts in with `{ sm11: true }` or `GRZ_SM11=1`.
- Fat string payloads still store **sha256**; FNV-1a is the sm11 integrity twin / GPU probe.

```bat
set GRZ_SM11=1
node --test test/monitor-sm11-gpu.test.mjs
```

## Ship bar

Landing this class of kernels and wiring monitor/mailbox hash+copy through them is enough to call the 8600 **useful**. See `docs/fleet-targets.md` and GitHub issue #13.
