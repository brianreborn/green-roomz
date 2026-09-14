# Note 9 USB ASAP — 2026-09-06 ~11:40 PT

**Result: UNAUTHORIZED**

## Machine
- label: qodesh
- machineId: 19f2c19e-e100-49f0-8507-813d66727973

## adb
- `C:\Users\brian\AppData\Local\Microsoft\WinGet\Packages\Google.PlatformTools_Microsoft.Winget.Source_8wekyb3d8bbwe\platform-tools\adb.exe`
- kill-server / start-server OK (tcp:5037)

## USB (present)
- ADB Interface — USB\VID_04E8&PID_6860&ADB
- Brian's Galaxy Note9 (MTP/WPD)
- SAMSUNG Mobile USB Composite / Connectivity / Modem
- Serial (from InstanceId / adb): `27841130ae1c7ece`

## adb devices -l
```
27841130ae1c7ece       unauthorized transport_id:1
```

## Props / Wi‑Fi
Skipped — device unauthorized. User must tap **Allow** on the RSA key prompt on the Note 9, then re-run.

No Knox/root/wipe/reboot/deploy performed.
