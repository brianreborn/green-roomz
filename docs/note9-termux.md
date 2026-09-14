# Note 9 Termux onboarding (2026-08-29, shalom USB)

## Ops policy (USB / qodesh)

- Plug USB into **qodesh** with phone **Wi-Fi OFF** (local-only). Prefer USB ADB over wireless.
- After `adb devices` shows the Note9, optional: `adb shell svc wifi disable` (leave airplane/Wi-Fi off).
- No Knox trip, no root wipe / secure_reboot.

No root. Do not `adb push` into Termux private dirs. Do not `su`.

## Hardware

| field | value |
|---|---|
| SKU | SM-N960U `crownqltesq` |
| serial | `27841130ae1c7ece` |
| SoC | SDM845 / Snapdragon 845, Adreno 630 |
| RAM | 5.7 GB (MemTotal ~5710492 kB; ~3.0 GB free under load) |
| OS | Android 10 / API 29 |
| Termux | `com.termux` uid `u0_a314`; Node **v26.4.0** |

## Measured 0.5B Q4_K_M (CPU, 4 threads)

| test | t/s |
|---|---|
| llama-cli interactive gen | 8.4 |
| llama-bench pp64 | **36.8** |
| llama-bench tg32 | **23.8** |

Historical host pack: android-arm64 runtime (~219 MB) + `Qwenstral-Small-3.1-0.5B.Q4_K_M.gguf` (~439 MiB) under pack `runtime/android-arm64/` + `models/` (not LocalAI paths). ADB push ~28 MB/s. PF-M3: deploy pushes **all** files under pack `models/` when present; Termux setup mkdirs `$HOME/grz-runtime/{bin,lib,models,missing}` and copies all staged models.

## Live layout on device

| path | who | role |
|---|---|---|
| `/data/local/tmp/grz` | `shell` 777 | adb drop zone (bin/lib/models + scripts). **SELinux: Termux cannot execute here.** |
| `~/grz-runtime` | Termux | copied ELF + wrap `run-llama-server.sh` (this is what GRZ spawns) |
| `~/green-roomz` | Termux | JS tree, manifest `config/agents.note9.json` |
| `/sdcard/Download/grz` | sdcard_rw | logs after `termux-setup-storage` (`setup.log`, `serve.pid`) |

Gateway: Termux `node` `127.0.0.1:8080`. From shalom: `adb forward tcp:18080 tcp:8080` then `http://127.0.0.1:18080`.

Resident **tool-router-agent** `:8187` is the only GGUF on the phone. Other aliases stay `unavailable` (missing specialist files). Chat smoke 2026-08-29: HTTP 200 ~4.5 s via forward.

## Why `/data/local/tmp` failed

- `/sdcard` is `noexec` and `rw-rw----` until `termux-setup-storage`.
- `bash /sdcard/.../enable-ext.sh` → **Permission denied** (read).
- `[[ -x /data/local/tmp/grz/bin/run-llama-server.sh ]]` fails under Termux even when the file is `755`: **SELinux `untrusted_app` cannot execute `/data/local/tmp`**. Copy runtime into `$HOME/grz-runtime`.
- Termux also cannot **write** `/data/local/tmp` (status files). Logs go to `$HOME` and `/sdcard/Download/grz`.

## ADB / Termux automation (do not race)

- `am startservice … RunCommandService` from `adb shell` → **Permission Denial** `com.termux.permission.RUN_COMMAND`.
- `am broadcast … RUN_COMMAND` returns 0 and does nothing.
- `input text` into Termux works if the **terminal_view is focused** and **CTRL extra-key is off**. Sticky CTRL turns `bash` into `ash`.
- Dump UI first: `uiautomator dump` and read `com.termux:id/terminal_view` `content-desc`.
- Type `ba` then `sh` then `%s/data/local/tmp/grz/setup.sh`. Never toggle CTRL unless you mean Ctrl-C.

`allow-external-apps=true` was written to `~/.termux/termux.properties` (script printed `enabled`; writing status into tmp failed).

## Scripts in this repo

| file | use |
|---|---|
| `config/agents.note9.json` | Termux manifest (`${HOME}/grz-runtime/…`) |
| `scripts/note9-termux-setup.sh` | pkg nodejs, copy runtime into `$HOME`, validate, serve |
| `scripts/note9-enable-external-apps.sh` | `allow-external-apps=true` |
| `scripts/note9-restart-serve.sh` | copy `src/memory.mjs`, kill pidfile, serve |
| `scripts/note9-run-llama-server.termux.sh` | example wrap (device copy lives in `$HOME/grz-runtime`) |

Push scripts with `adb push` to `/data/local/tmp/grz/` (`chmod 644`) and run **`bash /data/local/tmp/grz/setup.sh`** from a Termux prompt (bash reads tmp; it does not exec the file bit).

## RAM admission

`src/memory.mjs`: headroom **2 GiB** if `os.totalmem() >= 8 GiB`, else **256 MiB**. Without that, Note 9 rejected cpu-4 (`estimate ~1.27 GiB + 2 GiB headroom > ~3.0 GiB free`).

## Next (not done)

- Adreno 630 OpenCL/Vulkan llama backend (CPU pack only today).
- Pixel 8 same pack; not pushed.
- Specialist GGUFs on phone (code/text/embed) — RAM-tight.
- qodesh still ping-timeout at last check (`192.168.1.40`).
- Do not Magisk/root unless a later task truly cannot copy into `$HOME`.
