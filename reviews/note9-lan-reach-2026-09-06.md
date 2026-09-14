# Galaxy Note 9 LAN/ADB reach — qodesh — 2026-09-06

**Status: NOT FOUND**

Checked from machine **qodesh** (`19f2c19e-e100-49f0-8507-813d66727973`) at ~18:34 PT (2026-09-06). Constraints honored: no Knox trip, no root, no wipe/reboot, no Afterburner, no green-roomz deploy; read-only probes only; cmd under Documents preferred.

## Summary

| Check | Result |
|-------|--------|
| ADB binary | **Installed this session** (was missing) |
| `adb devices -l` | Empty (no USB, no wireless) |
| USB Note 9 present | **No** (historical PnP only) |
| LAN ARP phone neighbor | **No** (gateway only) |
| Known prior wireless IP | **None found** |
| Port 5555 light probe | **Skipped** — no phone-like ARP neighbors |

## 1) Find / install ADB

**Before:** Missing everywhere checked:

- `where adb` — not found
- `C:\adb`, `C:\platform-tools` — absent
- `%LOCALAPPDATA%\Android\Sdk\platform-tools` — absent (no Android SDK tree)
- scoop shim/app — absent
- Android Studio platform-tools — absent
- `ANDROID_HOME` / `ANDROID_SDK_ROOT` — unset
- winget installed packages — no prior Platform-Tools

**Action:** Quiet install of platform-tools only (not Android Studio):

```text
winget install --id Google.PlatformTools -e --accept-package-agreements --accept-source-agreements --disable-interactivity
```

- Package: `Google.PlatformTools` **37.0.1**
- Path: `C:\Users\brian\AppData\Local\Microsoft\WinGet\Packages\Google.PlatformTools_Microsoft.Winget.Source_8wekyb3d8bbwe\platform-tools\adb.exe`
- ADB: `1.0.41` / `37.0.1-15733141`
- Note: winget modified user PATH; existing shells may need refresh. Use full path above until then.

## 2) adb start-server / devices

```text
adb start-server   → daemon started on tcp:5037
adb devices -l     → List of devices attached  (empty)
```

## 3) Restart + USB

- `adb kill-server` / `start-server` / `devices -l` — still empty
- Present USB: Logitech `VID_046D&PID_C53D`, other `VID_1EA7&PID_0066` — **not Samsung**
- No present `AndroidUsbDeviceClass` / WPD portable phone
- **Historical (Present=False) PnP entries** prove Note 9 was previously on this PC:

| FriendlyName | InstanceId (abbrev) | Present |
|--------------|---------------------|---------|
| Brian's Galaxy Note9 | `USB\VID_04E8&PID_6860\...` | False |
| ADB Interface (×2) | `VID_04E8&PID_6860&MI_01/04` | False |
| SAMSUNG_Android | `VID_04E8&PID_6860&MI_03` | False |
| USB Composite Device | `VID_04E8&PID_6860\27841130AE1C7ECE` | False |

Serial seen historically: `27841130AE1C7ECE`. Cable/USB debugging not active now.

## 4) LAN reach

**Host Wi-Fi:** `10.240.132.229/24`  
**Gateway:** `10.240.132.188` (`0e-3f-90-d3-c6-a4`)  
Ethernet: disconnected.

**ARP** (after one broadcast ping to `10.240.132.255`): only gateway + multicast/static — **no other hosts**, nothing phone-like (no Samsung OUI neighbors).

**Hostname probes** (DNS): `android`, `galaxy`, `note9`, `samsung`, `SM-N960U`, `phone` — none resolve.

**Prior Note IP:** docs/history show Note 9 work via **USB on shalom** (`SM-N960U`), not a recorded wireless ADB IP for qodesh. Per instructions: **no aggressive subnet port-scan**; 5555 probe only on identifiable phone ARP neighbors → **none to probe**.

## 5) Device props

Not applicable — no `adb` device appeared. Did not run `getprop` or deploy green-roomz.

## Concrete status

**NOT FOUND**

ADB is available on qodesh after winget Platform-Tools install. Galaxy Note 9 is not on USB and not visible on this LAN segment from ARP/DNS. Next human steps (not done here): plug USB with debugging authorized, or enable wireless debugging / `adb tcpip 5555` once briefly on USB and note the phone DHCP IP.

## Cleanup notes

Temp helpers left under Documents on qodesh: `_usb_check.ps1`, `_lan_light.ps1`, `_usb_comp.ps1` (and possibly `_usb_check.ps1` remnants). Safe to delete.
