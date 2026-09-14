# sm11-monitor

Minimal **CUDA 6.5 / sm_1.1** probe for qodesh **GeForce 8600 GT**.

Proves the GPU can do the security-monitor floor work:

- device **copy** (mailbox private slot / F3–F21)
- **FNV-1a** payload hash

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
```

Expect `copy_ok=1 hash_ok=1` and `device0=GeForce 8600 GT sm_11`.

**Live proof (qodesh):** `copy_ok=1 hash_ok=1` on the 8600 GT with CUDA 6.5 / sm_11.

## Ship bar

Landing this (and wiring most monitor ops through the same class of kernels) is enough to call the 8600 **useful**. See `docs/fleet-targets.md` and GitHub issue #13.
