# McAfee on shalom (Windows host)

McAfee Premium Individual is installed (`C:\Program Files\McAfee\wps\mc-launch.exe`, Real-Time Scanning). It has already false-positived Green-Roomz operator scripts:

- 2026-08-28 2:29 PM PT: "We protected your PC by stopping a threat" / blocked a "malicious script" while bouncing `green-roomz serve`, and again while elevating `netsh wlan set autoconfig`.
- The first helper used `Add-Type` / `kernel32` (never do that on this host). Follow-ups were ordinary `Stop-Process`, `Start-Process node`, and `Start-Process netsh -Verb RunAs`.
- Do **not** turn Real-Time Scanning off. Exclude the trusted trees and Allow the blocked item in Protection History.

## Folders to exclude

McAfee → **My Protection** (or Antivirus) → **Real-Time Scanning** → **Excluded Files** → **Add folder**.

| Path | Why |
|---|---|
| `C:\LocalAI` | GGUFs, llama-server, whisper, piper, sd-server, EAGLE-3 venv |
| `C:\Users\brian\Documents\green-roomz` | git working copy |
| `C:\Users\brian\Documents\Codex\2026-08-28\files-pasted-by-the-user-1\outputs\green-roomz` | live `serve` tree on :8080 |
| `C:\Program Files\nodejs` | `node.exe` launching the gateway |

Do not exclude all of `%TEMP%`. If Grok Bot PowerShell in Temp still gets blocked, Allow that specific event in Protection History.

## After an alert

1. Open McAfee (Start → McAfee).
2. Protection / scan history → the blocked script → **Allow** if offered.
3. Add the folders above.
4. Retry the original action (serve bounce, elevated `netsh`).

## Related: Wi-Fi auto-switch

`netsh wlan show autoconfig` is **disabled** on interface `Wi-Fi`. That is why networks do not auto-switch. `WlanSvc` is already Running/Automatic. After McAfee will allow an elevated prompt:

```bat
netsh wlan set autoconfig enabled=yes interface="Wi-Fi"
netsh wlan show autoconfig
```

Do not delete saved profiles. Do not `winsock reset` unless enabling autoconfig is not enough.

## Operator rules

- No `Add-Type` / P/Invoke in shalom helper scripts.
- Prefer `Start-Process node.exe ... -WorkingDirectory <green-roomz>`.
- Models stay under `C:\LocalAI` (not in git).
