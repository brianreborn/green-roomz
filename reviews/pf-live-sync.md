# PF + P0 live sync onto e2e-fresh serve

**When:** 2026-09-06 ~08:02–08:03 PT (15:02–15:03 UTC)  
**Target:** `/workspace/e2e-fresh/green-roomz` LIVE serve  
**Source:** `/workspace/green-roomz` (PF + P0 tree)  
**Constraints honored:** no `git push`; no `stop.sh` against live; no `fuser -k 8187` (gateway drained llama itself).

## 1. File sync

`rsync -a` / `cp -a` from green-roomz → e2e-fresh:

| Path | Result |
|------|--------|
| `src/` | Synced. Previously differed: `benchmark.mjs`, `config.mjs`, `constants.mjs`, `process-manager.mjs`, `util.mjs` (now identical). |
| `bin/green-roomz.mjs` | Was DIFF → copied; now identical. |
| `policies/` | `general-text.md` differed → synced. |
| `config/agents.cursor.json` | Already SAME. |
| `start.sh`, `stop.sh`, `start.cmd`, `stop.cmd`, `install-windows.cmd` | Already present/SAME; re-copied for consistency. |

Post-sync: `diff -rq src/` clean; bin + policies match.

## 2. Restart (no stop.sh)

**Before:**
- node `1329948` on `127.0.0.1:8080` (cwd e2e-fresh)
- llama-server `1329974` on `127.0.0.1:8187` (binary/model paths under `/workspace/green-roomz/...` despite cwd e2e-fresh)

**Action:** `kill -TERM 1329948` only (node :8080). Did **not** run `./stop.sh` or `fuser -k 8187`.

**Drain:** Gateway exit reaped llama — pid `1329974` gone within ~3s. Ports 8080 and 8187 free.

**Restart from e2e-fresh:**
```bash
cd /workspace/e2e-fresh/green-roomz
node bin/green-roomz.mjs serve --manifest config/agents.cursor.json --host 127.0.0.1 --port 8080
```
(nohup → `data/serve.log`)

**After:**
- node `1585752` → `:8080`
- llama-server `1585774` → `:8187`  
  Binary/model now correctly under `/workspace/e2e-fresh/green-roomz/runtime/...` and `models/...`
- `tool-router-agent` ready; other agents unavailable (missing models) → health `status: "degraded"` but HTTP **200**.

## 3. Proofs

| Check | Result |
|-------|--------|
| `GET /health` | **200** (body `status: "degraded"`; expected with partial agent set) |
| `POST /v1/chat/completions` with `"messages":42` | **400** `{"error":{"message":"messages must be an array","type":"validation_error"}}` |
| `POST /health` | **405** `{"error":{"message":"Method not allowed"}}` |
| PF1 pidfile on new serve | **Yes.** `data/serve.pid` → `1585752\n`; `data/children.json` lists `tool-router-agent` pid `1585774` port `8187` state `ready` |
| `green-roomz stop` vs live | **Not executed against live** (per instruction). CLI `stop` is pidfile-scoped: reads `data/serve.pid`, SIGTERM gateway, then reaps `children.json` PIDs only (no image-name kill). `./stop.sh` also pidfile-first but was **not** run against live. Live left running after TERM-only recycle. |

## 4. Live state at note time

- Health: 200 / degraded  
- Gateway PID: `1585752` (matches `data/serve.pid`)  
- Llama PID: `1585774` (matches `data/children.json`)  
- Listen: `127.0.0.1:8080`, `127.0.0.1:8187`

## 5. Not done

- No git commit/push  
- No `stop.sh` / `node … stop` against live  
- No `fuser -k 8187`
