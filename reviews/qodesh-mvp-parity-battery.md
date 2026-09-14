# qodesh MVP parity battery results

**Machine:** qodesh (`19f2c19e-e100-49f0-8507-813d66727973`)  
**When:** 2026-09-06 ~05:38–05:43 PM PT (reverify; first run ~08:38–08:46 AM PT)  
**Tree:** `C:\Users\brian\Documents\green-roomz`  
**Gateway:** `http://127.0.0.1:8080`  
**Manifest:** `config\agents.windows-mvp.json` (`--threads` / `--threads-batch` **1**)  
**Runner:** `scripts\mvp-parity-battery-locked.cmd` → `mvp-parity-battery.cmd` → `mvp-parity-battery.ps1`  
**Constraints:** never GGUF on 8600 GT; CPU llama only (`--device none --n-gpu-layers 0`); no Afterburner; no git push; PF-aware stop (PID only, never `/IM llama-server.exe`).

---

## Summary (reverify PASS)

| Case | Name | Result | Notes |
|------|------|--------|-------|
| A | health `GET /health` | **PASS** | `product=Green-Roomz` `status=degraded` http=200 (~2.5s) |
| B | `GET /v1/models` | **PASS** | 11 aliases incl. `general-text-speculator`, `tool-router-agent` |
| C | non-stream chat | **PASS** | http=200 reply=`parity-ok` (~17s) |
| D | multi-turn recall | **PASS*** | http=200 soft-match (no literal Ada); quality soft on 0.5B (~92s) |
| E | `stream:true` SSE | **PASS** | `data_lines=51` `done=True` (~69s) — stream fix live |
| F | abort mid-stream | **PASS** | client kill closed cleanly |
| G | system+user roles | **PASS*** | http=200; reply quality soft (~84s) |

**Overall reverify: PASS** (7 pass / 0 fail) — artifact `data\mvp-parity-last.json` (`started_utc` 2026-09-07T00:38:47Z, `finished_utc` 2026-09-07T00:43:18Z).

Honesty: this is **0.5B / Athlon** capability-surface parity vs basic ChatGPT/Grok APIs, **not** SOTA answers. Expect terse/quirky replies.

---

## What fixed case E + cold-start contention

1. **Stream fix (gateway a6be0f9):** `completeOnResident` no longer forces `stream: false`. Client `stream: true` now yields `content-type: text/event-stream` with SSE `data:` chunks even on `resident_fallback` → nexus. Manual probe confirmed headers + many `data:` lines + `[DONE]`.
2. **threads=1 MVP manifest:** llama profiles use `--threads 1` / `--threads-batch 1` so nexus + specialist Σ≤2 on 2-core Athlon. Live nexus cmdline confirmed:
   ```
   llama-b10702-bin-win-cpu-x64\llama-server.exe ... --port 8187 ... --device none --n-gpu-layers 0 --threads 1 --threads-batch 1 ...
   ```
   general-text on `:8184` also `--threads 1` when warm.

---

## First-run (AM) contrast

| Case | First run | Reverify |
|------|-----------|----------|
| E | **FAIL** (JSON via `resident_fallback`, no `data:`) | **PASS** (SSE `data_lines=51`) |
| C/D/G | PASS* soft / nexus gibberish when threads=4 blocked specialist | PASS* with threads=1 path available |
| Overall | **FAIL** | **PASS** |

---

## Live ports (reverify)

```
TCP 127.0.0.1:8080  LISTENING  (node serve --manifest agents.windows-mvp.json)
TCP 127.0.0.1:8187  LISTENING  (CPU llama nexus, --threads 1, --device none)
TCP 127.0.0.1:8184  LISTENING  (CPU llama general-text when warm, --threads 1)
```

No GGUF on 8600 GT observed. Runtime: `runtime\llama-b10702-bin-win-cpu-x64\llama-server.exe` via `GRZ_LLAMA` / `start-windows-mvp.cmd`.

---

## Runner artifacts

- `scripts\mvp-parity-battery.cmd` / `.ps1` (cases A–G)
- `scripts\mvp-parity-battery-locked.cmd` (mkdir lock; defeats dual local-tool spawn)
- `scripts\start-windows-mvp.cmd`, `scripts\mvp-bounce-and-battery.cmd`
- `data\mvp-parity-last.json` (PASS scoreboard)
- `stop.cmd` (PF1 PID-based stop)

---

## Follow-ups

- [x] Reconnect qodesh; bounce onto threads=1 MVP; re-run battery
- [x] Case E PASS with SSE after stream fix + threads=1
- [ ] Optional: assert `x-green-roomz-effective-alias: general-text-speculator` in a future runner revision (surface currently OK via resident_fallback SSE too)
- [ ] Local-tool shell on qodesh often double-invokes commands — prefer lock/detached Start-Process for long batteries
