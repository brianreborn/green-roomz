# legacy Android phone LAN/ADB reach — mvp-host — 2026-09-06

**Status: NOT FOUND**

Checked from machine **mvp-host** (`<machine-id>`) at ~18:34 PT (2026-09-06). Constraints honored: no Knox trip, no root, no wipe/reboot, no Afterburner, no green-roomz deploy; read-only probes only; cmd under Documents preferred.

## Summary

| Check | Result |
|-------|--------|
| ADB binary | **Installed this session** (was missing) |
| `adb devices -l` | Empty (no USB, no wireless) |
| USB Android-legacy phone present | **No** (historical PnP only) |
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
- Path: `%USERPROFILE%\AppData\Local\Microsoft\WinGet\Packages\Google.PlatformTools_Microsoft.Winget.Source_8wekyb3d8bbwe\platform-tools\adb.exe`
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
- **Historical (Present=False) PnP entries** prove Android-legacy phone was previously on this PC:

| FriendlyName | InstanceId (abbrev) | Present |
|--------------|---------------------|---------|
| Brian's legacy Android phone | `USB\VID_04E8&PID_6860\...` | False |
| ADB Interface (×2) | `VID_04E8&PID_6860&MI_01/04` | False |
| SAMSUNG_Android | `VID_04E8&PID_6860&MI_03` | False |
| USB Composite Device | `VID_04E8&PID_6860\<adb-serial>` | False |

Serial seen historically: `<adb-serial>`. Cable/USB debugging not active now.

## 4) LAN reach

**Host Wi-Fi:** `198.51.100.229/24`  
**Gateway:** `198.51.100.188` (`<gateway-mac>`)  
Ethernet: disconnected.

**ARP** (after one broadcast ping to `198.51.100.255`): only gateway + multicast/static — **no other hosts**, nothing phone-like (no Samsung OUI neighbors).

**Hostname probes** (DNS): `android`, `<vendor-model>`, `<host>`, `samsung`, `SM-N960U`, `phone` — none resolve.

**Prior Note IP:** docs/history show Android-legacy phone work via **USB on win-host** (`SM-N960U`), not a recorded wireless ADB IP for mvp-host. Per instructions: **no aggressive subnet port-scan**; 5555 probe only on identifiable phone ARP neighbors → **none to probe**.

## 5) Device props

Not applicable — no `adb` device appeared. Did not run `getprop` or deploy green-roomz.

## Concrete status

**NOT FOUND**

ADB is available on mvp-host after winget Platform-Tools install. legacy Android phone is not on USB and not visible on this LAN segment from ARP/DNS. Next human steps (not done here): plug USB with debugging authorized, or enable wireless debugging / `adb tcpip 5555` once briefly on USB and note the phone DHCP IP.

## Cleanup notes

Temp helpers left under Documents on mvp-host: `_usb_check.ps1`, `_lan_light.ps1`, `_usb_comp.ps1` (and possibly `_usb_check.ps1` remnants). Safe to delete.
