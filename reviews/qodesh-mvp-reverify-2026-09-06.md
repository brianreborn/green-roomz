# qodesh MVP reverify — 2026-09-06

**Agent summary for follow-on work.** Machine: qodesh (`19f2c19e-e100-49f0-8507-813d66727973`). Tree: `C:\Users\brian\Documents\green-roomz`.

## Verdict

| Item | Result |
|------|--------|
| Overall battery | **PASS** (7/7) |
| Case E SSE | **PASS** (`data_lines=51`, `done=True`) |
| Reverify pending | **CLEAR** |
| Artifact | `data\mvp-parity-last.json` (finished ~05:43 PM PT) |
| Scoreboard doc | `/workspace/reviews/qodesh-mvp-parity-battery.md` |

## What was done

1. **Copied from box → Documents\green-roomz:**
   - `src/gateway.mjs` (stream fix a6be0f9; 58957 bytes)
   - `config/agents.windows-mvp.json` (threads=1)
   - scripts: `mvp-parity-battery.cmd/.ps1`, `start-windows-mvp.cmd`, `mvp-bounce-and-battery.cmd`
   - Also synced missing/stale modular `src/*` deps the new gateway needs (`council.mjs`, `compile-prompt.mjs`, `timing-quant.mjs`, `cpu-set.mjs`, `kernel-text.mjs`, `process-manager.mjs`, …) — old qodesh tree had a monolith-era `gateway.mjs` (29KB) and lacked several modules.
2. **PF-aware bounce:** `stop.cmd` (PID/owned-port only; never `/IM llama-server.exe`) then start with `GRZ_LLAMA=...\llama-b10702-bin-win-cpu-x64\llama-server.exe` + windows-mvp manifest on `:8080`.
3. **Confirmed nexus cmdline:** CPU b10702, `--device none`, `--n-gpu-layers 0`, **`--threads 1 --threads-batch 1`**, port `8187`. general-text warm on `8184` also threads=1.
4. **Health 200** (`status=degraded` expected — missing non-chat models).
5. **Battery:** lock-guarded run (`scripts\mvp-parity-battery-locked.cmd`) to defeat Cursor local-tool **double-spawn** on qodesh. Without the lock, dual batteries raced and produced flaky 500 / curl-18 on Athlon.

## Stream fix (why E now passes)

`Gateway.completeOnResident` previously forced `stream: false`, so `resident_fallback` → nexus returned JSON, not SSE. Fix honors client `stream: true`. Live probe headers included `content-type: text/event-stream` and `x-green-roomz-route-reason: resident_fallback` with many `data:` chunks + `[DONE]`.

## Hard rules observed

- No GGUF on 8600 GT; CPU llama only; no Afterburner; no git push; PF-aware stop only; prefer cmd under Documents\green-roomz.

## Ops notes for next agent

- Prefer `scripts\mvp-parity-battery-locked.cmd` or detached `Start-Process` + poll `data\battery.lock` — plain `mvp-parity-battery.cmd` via local Shell often runs twice.
- Orphan `data\battery.lock` if a battery dies mid-run (connection drop); delete only when no `mvp-parity` process holds it.
- `start-windows-mvp.cmd` sets `GRZ_ROOT` / `GRZ_MANIFEST` / `GRZ_LLAMA` correctly.
- Quality on 0.5B remains soft (C/D/G PASS* HTTP-ok); do not treat as Instruct-grade.
- Optional follow-up: assert effective-alias `general-text-speculator` in runner (surface OK today even via nexus SSE).

## Live at end of reverify

```
:8080  node green-roomz serve --manifest agents.windows-mvp.json
:8187  llama-server CPU nexus tool-router-agent --threads 1
:8184  llama-server CPU general-text-speculator --threads 1 (when warm)
```
