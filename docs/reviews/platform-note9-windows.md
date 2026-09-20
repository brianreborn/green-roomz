# Platform review — Note 9 on qodesh ADB + Windows MVP paths

**Reviewer:** Platform Reviewer. **Host:** qodesh (this USB plug). **Date:** 2026-09-07.

Fingerprint only. Did **not** git commit/push, bounce serve, download models, install APKs/Magisk modules, run `android-cross-build.ps1`, start an Android sidecar, or treat this serial as Pixel 8.

| | |
|---|---|
| USB host | **qodesh** — Windows 10 Home 19045 (64-bit), Node v24.19.0, PowerShell 5.1 |
| ADB | `C:\Users\brian\AppData\Local\Microsoft\WinGet\Packages\Google.PlatformTools_Microsoft.Winget.Source_8wekyb3d8bbwe\platform-tools\adb.exe` **1.0.41 / 37.0.1-15733141** |
| Serial | `27841130ae1c7ece` |
| Device | Galaxy Note 9 **SM-N960U** `crownqltesq` — **not** Pixel 8 |
| Sidecar | **not started** (`src/hosts/android.mjs` read only) |
| Patch | **none** (see Windows path section) |

---

## 1. Note 9 live ADB fingerprint

`adb -s 27841130ae1c7ece get-state` → **`device`**.

`adb devices -l`: `27841130ae1c7ece device product:crownqltesq model:SM_N960U device:crownqltesq transport_id:1`.

### Identity / build

| key | value |
|---|---|
| `ro.product.model` | SM-N960U |
| `ro.product.device` / `name` | crownqltesq |
| `ro.product.manufacturer` / `brand` | samsung |
| `ro.board.platform` | sdm845 |
| `ro.hardware` | qcom |
| `ro.hardware.chipname` | SDM845 |
| `ro.product.cpu.abi` | **arm64-v8a** |
| `ro.product.cpu.abilist` | arm64-v8a,armeabi-v7a,armeabi |
| `dalvik.vm.isa.arm64.variant` | kryo300 |
| `dalvik.vm.isa.arm.variant` | cortex-a75 |
| `ro.build.version.release` / `sdk` | **10** / **29** |
| `ro.product.first_api_level` | 27 |
| `ro.vndk.version` | 29 |
| `ro.treble.enabled` | true |
| `ro.build.display.id` | QP1A.190711.020.N960USQU9FVG2 |
| `ro.build.version.incremental` | N960USQU9FVG2 |
| `ro.build.fingerprint` | `samsung/crownqltesq/crownqltesq:10/QP1A.190711.020/N960USQU9FVG2:user/release-keys` |
| `ro.build.version.security_patch` | 2022-06-01 |
| `ro.build.type` / `tags` | user / release-keys |
| `ro.csc.sales_code` / `ro.boot.carrierid` | CHA / **VZW** |
| `ril.official_cscver` | N960UOYN9FVG2 |
| `ro.boot.serialno` | 27841130ae1c7ece |
| `sys.usb.config` | mtp,conn_gadget,adb |
| kernel | `Linux localhost 4.9.186-22990573 #1 SMP PREEMPT Thu Jul 21 20:50:02 KST 2022 aarch64` (dpi@21HHAG04, gcc 4.9.x) |
| page size | **4096** (`getconf PAGESIZE`) |

### CPU (Kryo 385 / SDM845)

`Hardware: Qualcomm Technologies, Inc SDM845`. Implementer `0x51`. All 8 CPUs **online**, governor **schedutil**.

| cluster | CPUs | MIDR part | `cpuinfo_max_freq` | `cpuinfo_min_freq` | class |
|---|---|---|---|---|---|
| LITTLE | 0–3 | **0x803** (Kryo 385 Silver / A55-class) | **1 766 400** | 300 000 | 1.77 GHz |
| big | 4–7 | **0x802** (Kryo 385 Gold / A75-class) | **2 803 200** | 825 600 | 2.80 GHz |

`scaling_available_frequencies` on cpu4 listed up to **2 649 600**; `cpuinfo_max_freq` / `scaling_max_freq` still **2 803 200** (boost bin). Features include `fp asimd aes sha1 sha2 crc32 atomics fphp asimdhp` — no SVE.

Fleet **8–15 tok/s est** for 0.5B Q4 CPU is still the right band (no `llama-bench` this pass).

### GPU (Adreno 630)

| key | value |
|---|---|
| GLES (`dumpsys SurfaceFlinger`) | `Qualcomm, Adreno (TM) 630, OpenGL ES 3.2 V@415.0` (GIT@fdd61e0, Date:10/07/20) |
| `ro.hardware.egl` / `vulkan` | adreno / adreno |
| `ro.opengles.version` | 196610 (0x30002 = GLES 3.2) |
| `android.hardware.vulkan.version` | 4198400 = **Vulkan 1.1.0** |
| `android.hardware.vulkan.level` | 1 |
| `android.hardware.vulkan.compute` | present |
| kgsl `gpu_model` | **Adreno630v2** |
| kgsl clocks | idle **257 MHz**, max **710 MHz** (710/675/596/520/414/342/257) |
| this pass | gpuclk 257 MHz, busy **0%**, kgsl temp **26.3 °C** |

GPU pack later = **OpenCL and/or Vulkan on Adreno**, not Mali, not Hexagon HTP. `scripts/android-cross-build.ps1` is CPU-only today (`ANDROID_PLATFORM=android-28`, 4K pages, `GGML_CPU_ALL_VARIANTS`). **Not run.**

### RAM / storage (0.5B gate)

`/proc/meminfo` this plug:

| | kB | note |
|---|---|---|
| MemTotal | **5 710 492** | **5.45 GiB** (~5.7 GB class; matches fleet) |
| MemAvailable | **2 504 580** | ~2.39 GiB |
| MemFree | 620 340 | |
| Cached | 1 996 696 | |
| SwapTotal | 2 097 148 | ~2 GiB; **no** `/dev/block/zram0` node |
| SwapFree | 119 052 → 445 396 | moved between probes; swap in use |
| RbinTotal | 593 920 | Samsung reserved bin |

`dumpsys meminfo` totals: Total RAM **5,710,492K** (status normal); Free RAM **2,989,730K** (cached pss + cached kernel + free); Used RAM **3,402,116K**; Lost RAM **948,478K**. Tuning 256 (large 512). Uptime ~6.4 h this boot; realtime ~34 h including sleep.

`df -h`: **`/` 4.7G 99% (71M free)** — Termux pkgs must live on `/data`, not system. **`/data` 111G, 92G used, ~19G avail** — 432 MiB 0.5B Q4 plus ELF fits. `/storage/emulated` same 111G pool.

0.5B Q4 mmap (432 MiB) + KV + Node **fits if background PSS is reined in**. This pass had YouTube ~442 MB PSS, system, GMS, Firefox, launcher, etc. Swap is already partly full. Do not assume the fleet’s older “~3.0 GB avail” without a quiet RAM snapshot.

Battery: USB powered, charging, **85%**, 24.6 °C, Li-ion, health 2. Display **1440×2960 @ 60 Hz**, density override 560, **state OFF** during the plug.

### Userland (facts only — no exploit)

| probe | result |
|---|---|
| `whoami` / `id` | **`shell`** `uid=2000(shell)` `gid=2000(shell)` `context=u:r:shell:s0` |
| cwd | `/` |
| `ro.debuggable` | **0** |
| `ro.secure` / `ro.adb.secure` | 1 / 1 |
| SELinux | **Enforcing** (`getenforce`; `ro.build.selinux=1`) |
| `ro.boot.verifiedbootstate` | **green** |
| `ro.boot.flash.locked` | **1** |
| `ro.boot.warranty_bit` | **0** |
| `sys.oem_unlock_allowed` | **0** (`ro.oem_unlock_supported=1`) |
| `ro.crypto.state` / `type` | encrypted / block |

**Magisk — not confirmed on this plug.** Unprivileged ADB saw:

- no `com.topjohnwu.magisk` / KernelSU / HuskyDG packages (`pm list packages` and `-u`)
- no `magisk` / `su` / `ksud` on `PATH` (`/sbin:/system/sbin:/product/bin:/apex/...:/system/bin:/system/xbin:/odm/bin:/vendor/bin:/vendor/xbin`)
- no magisk/ksu getprops or init services
- no magisk/zygisk/ksu in `/proc/mounts` or `ps -A`
- `/sbin` is stock Samsung (`knox_changer`, `sswap` only); `/debug_ramdisk` empty
- `/data/adb` not listable as uid 2000 (expected; not evidence either way)

`docs/fleet-targets.md` still says **Magisk** from the shalom 2026-08-29 SKU note. **This qodesh pass does not reconfirm it.** Hidden Magisk is possible in theory; there is no Magisk Manager, no visible `magiskd`, and AVB is green+locked. **Do not assume KernelSU** (Pixel 8 row). Do not assume root from `user/release-keys` + `uid=2000`.

**Termux (present, old):**

| | |
|---|---|
| package | `com.termux` |
| versionName / versionCode | **0.101** / 101 |
| minSdk / targetSdk | 24 / **28** |
| firstInstallTime | 2021-10-25 |
| lastUpdateTime | 2023-11-11 |
| codePath | `/data/app/com.termux-wvODmdy2NkgyagCyN7BaRw==` |
| dataDir | `/data/user/0/com.termux` (mode 700, uid `u0_a314`; adb shell cannot list `files/usr/bin`) |
| shared | `/sdcard/Android/data/com.termux` exists (mtime 2026-08-29) |
| flags | `HAS_CODE ALLOW_CLEAR_USER_DATA` — **not** `DEBUGGABLE` |
| user 0 | installed, not hidden/stopped; `enabled=0` (COMPONENT_ENABLED_STATE_DEFAULT) |

Cannot confirm `nodejs` / `llama-server` inside Termux without `run-as` (will fail: not debuggable). Did not try. Termux 0.101 predates the current F-Droid repos (bintray sunset) — a later worker install may need a **newer Termux APK from F-Droid**, not an in-place `pkg update` on 0.101. Out of scope this pass (no APK install).

---

## 2. Windows path review (qodesh dogfood)

Host facts: **Microsoft Windows 10 Home** build **19045** (CIM). Other local docs still say “Win11”; `[Environment]::OSVersion` is also `10.0.19045`. Treat this box as **Win10 22H2**, not 22000+.

`HKLM\SYSTEM\CurrentControlSet\Control\FileSystem\LongPathsEnabled` = **0**. Classic **MAX_PATH 260** applies. Node v24.19.0, `process.platform === 'win32'`, `path.sep === '\\'`.

### `${GRZ_ROOT}` expansion (live `loadManifest`)

Allowlist in `src/util.mjs`: `GRZ_ROOT`, `GRZ_EXE`, `HOME`, `GRZ_LLAMA`. Percent-VAR is left literal.

`withDefaultGrzEnv` on this tree:

| var | value |
|---|---|
| `GRZ_ROOT` | `C:\Users\brian\Documents\green-roomz` |
| `GRZ_EXE` | `.exe` |
| `GRZ_LLAMA` | `C:\Users\brian\Documents\green-roomz\runtime\llama-server.exe` |
| `HOME` | **unset** in this PowerShell (USERPROFILE `C:\Users\brian` is **not** allowlisted) |

`loadManifest(config/agents.windows-mvp.json)` resolved:

| field | path | length |
|---|---|---|
| `runtimes.llama_server.command` | `C:\Users\brian\Documents\green-roomz\runtime\llama-server.exe` | 61 |
| nexus model | `...\models\Qwenstral-Small-3.1-0.5B.Q4_K_M.gguf` | 80 |
| text model | `...\models\Qwen2.5-0.5B-Instruct-Q4_K_M.gguf` | 80 |
| piper | `...\runtime\piper.exe` | 54 |

All **≪ 260**. `cwd` is 36 chars. No MAX_PATH hit on the MVP pack.

`scripts/start-windows-mvp.cmd` overrides `GRZ_LLAMA` to `runtime\llama-b10702-bin-win-cpu-x64\llama-server.exe` (~88 chars) — still fine. Bare `node bin\green-roomz.mjs serve --manifest config\agents.windows-mvp.json` uses the shorter `runtime\llama-server.exe` default (file exists). Did not bounce serve to compare.

Mixed separators: `${GRZ_ROOT}/runtime/llama-server${GRZ_EXE}` expands to `C:\Users\...\green-roomz/runtime/llama-server.exe`; `joinExpandedPath` / `path.normalize` turns it into backslashes **after** expand. Trailing-slash `GRZ_ROOT` also normalizes.

Empty allowlisted `GRZ_ROOT` expands to **`/runtime/llama-server.exe`**. On win32 `path.isAbsolute('/runtime/...')` is **true**, so `resolveManifestPath` will not rebase it. `assertRuntimeCommands` **does** fail-closed on the `/runtime/llama-server` prefix (covers the `.exe` form). `withDefaultGrzEnv` also replaces falsy `GRZ_ROOT` with the package root before expand, so the MVP path does not hit this unless someone passes a custom env with `GRZ_ROOT=""`.

Missing allowlisted `HOME` → **empty string**, not a literal `${HOME}` (`${HOME}/x` → `/x`). Unknown keys stay literal. `%GRZ_ROOT%` stays literal. Case-sensitive: `${grz_root}` does not match.

`nfcPath` is Darwin-only (no-op on win32) — correct.

Spawn path (`src/process-manager.mjs`): `shell: false`, `windowsHide: true`, `cwd: this.packRoot`. Spaces in the username would be OK (no cmd.exe quoting). POSIX `SIGSTOP`/`SIGCONT` is already disabled on win32 (`canSuspend = false`) — do not fight that here.

### CON / PRN / NUL

No sanitizer. `path.join(GRZ_ROOT, 'models', 'NUL')` produces `C:\Users\brian\Documents\green-roomz\models\NUL`. Opening that on Win10 without `\\?\` talks to the **NUL device**, not a file. Same for CON/PRN/AUX/COM1/LPT1. Manifests do not use those names. Latent footgun if a model field is ever `NUL` / `con.txt`, not a current MVP break.

### Patch decision

**No patch.** Instruction was: patch only if a **clear Windows-MVP bug is one file and tests exist**. There is **no** `test` coverage of `expandEnvironment` / `joinExpandedPath` / reserved names / MAX_PATH (`test/config.test.mjs` only checks alias lists). Residual notes (HOME vs USERPROFILE, reserved DOS names, `LongPathsEnabled=0`, Unix-only collapse string) are host/docs findings, not a one-file MVP defect with a test to extend.

---

## 3. Android sidecar vs Termux+gateway (Note 9)

`src/hosts/android.mjs` is a **client stub only**. Default endpoint **`http://127.0.0.1:8199`**, `POST/GET` `${endpoint}/v1/sidecar/handshake`, `Authorization: Bearer ${token}`. Requires `protocol_version === 1` and a `nonce`. `fingerprint()` is handshake JSON (`android_version`, `abi`, `soc`, `driver`, `runtime`, `thermal_policy`). Token compare is `secureEquals`.

Selected from `bin/green-roomz.mjs` only when `GREEN_ROOMZ_ANDROID_SIDECAR` is set (then **replaces** `WindowsHostAdapter`). There is **no** sidecar binary/APK in this repo, **no** android host test file, and **no** listener was started.

Loopback **127.0.0.1:8199** is **on-device**. Pointing qodesh’s Windows gateway at that URL would hit **qodesh**, not the phone, unless someone sets `adb reverse` (not done). The intended shape is: **gateway process on the phone** talking to a native sidecar on the same loopback.

### Can Note 9 run Termux + gateway later?

**Yes — that is the path.** Constraints from this plug:

- ABI **arm64-v8a**, API **29**, **4K pages** — matches `android-cross-build.ps1` `ANDROID_PLATFORM=android-28` + flexible page sizes (Pixel 8 16K is the other target of the same ELF).
- `com.termux` is already installed, but **0.101 / targetSdk 28** (2021/2023). Gateway = Termux `nodejs` + `config/agents.android.json` (`${GRZ_ROOT}/runtime/bin/llama-server`, cpu-2 nexus, cpu-4 specialists). Private `files/usr` is not visible to `adb shell`.
- `/data` has ~19 GB free; 0.5B Q4 + arm64 ELF fit.
- RAM: ~2.4 GB MemAvailable **now**; 0.5B worker is **conditional on killing heavy apps** (YouTube/Firefox/GMS). Swap already in use.
- SELinux Enforcing, uid 2000, non-debuggable Termux — copy via `adb push` to `/sdcard` then Termux `cp`, not `run-as`.
- No confirmed Magisk: stay in **userland** (Termux app dir / shared storage). Do not plan `/data/adb` modules.

### Can Note 9 run a native sidecar later?

**Not with the current llama.android APK story.** Fleet already records llama.android **`minSdk 33` → Pixel 8 only**; Note 9 is API 29. The handshake adapter does not implement inference; a native sidecar would be a new Android service on `:8199` that this client can fingerprint. **Out of this dogfood.** CPU ELF via Termux does not need that sidecar.

Pixel 8 (KernelSU, 16K, Tensor/Mali) is a **different** USB device. This serial is SDM845 / Adreno / 4K / no visible KSU.

---

## 4. Verdict

| question | answer |
|---|---|
| ADB authorized on qodesh? | **Yes** — `get-state=device`, RSA already allowed |
| SKU | **SM-N960U / SDM845 / Adreno 630 v2 / Android 10 API 29 / 5.7 GB** |
| Magisk / KernelSU this pass | **Not visible.** Do not copy fleet Magisk or Pixel KernelSU onto this plug |
| 0.5B Q4 worker | **Possible in Termux userland** after a quieter RAM picture and a usable Termux/Node; tok/s still **est 8–15** |
| GPU worker | Not in the CPU pack. Later OpenCL/Vulkan on Adreno 630, max 710 MHz |
| Native sidecar | Handshake stub only; APK minSdk 33 will not install here |
| Windows MVP paths | **OK** on this tree (61–80 char paths, expand+normalize works, LongPaths disabled but unused). No code patch |
| Do not | `adb push` / Termux copy until live agent gate on shalom/qodesh says so (`docs/fleet-targets.md`); do not NDK this session |

**Next (not this review):** refresh Termux from F-Droid when installing a worker; copy the existing arm64 CPU pack; `GRZ_ROOT=... node bin/green-roomz.mjs serve --manifest config/agents.android.json` **on the phone**. Measure tok/s before touching OpenCL.
