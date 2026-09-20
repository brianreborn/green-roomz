# GPU prep — qodesh (2026-09-14)

Prepare only. Did **not** bounce serve, run the CUDA 6.5 installer, enable PnP devices, or switch the live manifest to `Vulkan0`.

Hostname **qodesh**. Live `:8080` did not answer this pass (`serve.pid` 15372 has no process).

## Operator plan (this turn)

Plug the discrete GPU in, then **both DVI and VGA on that card** so Windows starts it and we can resume the sm_1.1 path.

**Cables:** both connectors on the **PCIe NVIDIA card**, not one on the motherboard 4200 VGA and one on the card. IGP VGA + card DVI keeps the 8600 unstarted (today’s state). Unplug the 4200 VGA after the card has picture.

8600 GT era boards are usually **DVI + VGA** (sometimes DVI+DVI). Dual-cable is dual-head on one GPU, not hybrid IGP.

Power off. Seat one NVIDIA card (8600, not the 9500 ghost). 6-pin if the card has it. Then DVI+VGA, then boot.

## What is actually driving the display (before plug-in)

| Device | PnP | Present | Notes |
|---|---|---|---|
| **ATI Radeon HD 4200** | OK | yes | Only live GPU. ~368 MiB. IGP. llama Vulkan `--list-devices` → **(none)** |
| **NVIDIA GeForce 8600 GT** | **Unknown** | no | Original worker GPU. sm_1.1, ~224 MiB. Same PCI instance `4&D64323&0&0010` as the 9500 ghost |
| NVIDIA GeForce 9500 GT | Unknown | no | Ghost / previous card in that slot (`DEV_0640`) |
| Intel HD Graphics 620 | Unknown | no | Ghost (not this Athlon box) |
| NVIDIA Virtual Audio | OK | yes | Not a GPU |

Vulkan pack `C:\LocalAI\llama-b10665-bin-win-vulkan-x64` **is on disk** (`ggml-vulkan.dll` 54 MiB). `llama-server --list-devices` still **(none)** — matches fleet note “Vulkan dead on 8600.” CPU runtime `runtime\llama-b10702-bin-win-cpu-x64` also **(none)**.

`config\agents.windows.json` currently points llama at the **CPU** binary with `GGML_VULKAN=0`, but specialist profiles still name **`Vulkan0`**. Do not `serve --manifest` that file until a real device exists; store-winners stay off.

CUDA 6.5 installer is **not** on this disk (`C:\LocalAI\_tmp\cuda_6.5.19_windows_general_64.exe` missing). VS2013 tree **is** present (`Microsoft Visual Studio 12.0` + VC).

## Why GPU is down

1. **8600 GT is not started.** Display is the 4200 IGP. No NVIDIA 3D device → no CUDA, no Vulkan device list.
2. Modern llama Vulkan will not see sm_1.1 even if the card comes back. Path is **CUDA 6.5 / GGML back-compat**, not `Vulkan0`.
3. 0.5B Q4 is **432 MiB**; VRAM is **~224 MiB**. Plan remains **tiny `n-gpu-layers` + CPU mmap**, never full offload.

## After you boot with DVI+VGA (resume checklist)

I will re-run observe-only:

1. `Get-PnpDevice -Class Display` — 8600 should be **OK** and Present; 4200 may drop or stay as secondary.
2. `llama-server --list-devices` on the Vulkan pack — still expect **(none)**; that is not a failure.
3. Device Manager problem codes (43/22) — era driver `9.18.13.4192` only; no Game Ready.
4. Keep MVP CPU serve. No CUDA installer, no `Vulkan0` manifest.

Then, only if 8600 is OK:

5. Copy CUDA 6.5 from shalom LAN and **hash** (`md5 63575eee9cb5cbf3e84f9c4496060399`) — do not run until you say so.
6. VS2013 `cl` + CUDA 6.5 `nvcc` for sm_1.1. Not VS2022-as-fake.
7. Custom sm_1.1 binary; first probe `--n-gpu-layers 1` on 0.5B.

## Smallest next patch (code, after you pick)

- **A (this session, safe):** leave MVP CPU-only; document this board (done).
- **B:** inject `--device none` on empty profiles / refuse `Vulkan0` when `--list-devices` is none.
- **C:** after 8600 is Present/OK, add `scripts/gpu-sm11-probe.cmd` that only lists devices + 1-layer bench. No installer.

## Do not

- Run `cuda_6.5.19_windows_general_64.exe` on Win11 without an explicit ask.
- Point live serve at `Vulkan0` / `agents.windows.json` vulkan-all.
- Put the whole 0.5B Q4 in 224 MiB VRAM.
- Bounce `:8080` / `:8187` from this prep.
- Flash / enable the Intel 620 or 9500 ghosts.
- Leave VGA on the **motherboard** 4200 if you want the 8600 to start.
