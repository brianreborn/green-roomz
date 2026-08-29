# Deployment & operations

The one place that describes how Green-Roomz actually runs, how to tell it is
healthy, and how to recover it.

## One gateway, many backends

There is exactly **one** thing you talk to — the gateway on **`127.0.0.1:8080`**.
It is a dependency-free Node process. It owns and supervises the model backends;
you never call those directly.

| Port | What | Started |
|------|------|---------|
| **8080** | the gateway (this repo, `node bin/green-roomz.mjs serve`) | you, once |
| 8187 | `tool-router-agent` — resident 0.5B CPU nexus | pre-warmed at serve start, stays loaded |
| 8181 | `vision-layout-agent` | on first use (cold start) |
| 8182 | `audio-transcription-agent` (whisper-server) | on first use |
| 8183 | `qwenstral-code-speculator` | on first use |
| 8184 | `general-text-speculator` | on first use |
| 8185 | `semantic-embedding-agent` | on first use |
| 8186 | `retrieval-rerank-agent` | on first use |
| 8188 | `safety-policy-agent` | on first use |
| 8189 | `speech-synthesis-agent` (piper — one-shot CLI, **no server**) | n/a |
| 8190 | `image-generation-agent` (sd-server) | on first use |
| — | `security-monitor-agent` | logical, no process |

Eleven aliases. Non-resident backends cold-start on first request and are
**evicted when idle** (`gateway.idle_evict_ms`, default 300 s) or when more than
`gateway.max_warm_specialists` (default 3) are warm — so the box is never asked
to hold every model at once.

## Where it runs

The canonical live tree is the **dev checkout**, not a separate copy:

```
C:\Users\brian\Documents\green-roomz     <- run serve from here, on `main`
C:\LocalAI                               <- model store only (*.gguf), NOT a source tree
```

`C:\LocalAI` holds the model files (`config/agents.windows.json` points at them)
and nothing you edit. Any `green-roomz` checkout under `C:\LocalAI\...` is legacy
— do not serve from it.

## Start it

```powershell
# from C:\Users\brian\Documents\green-roomz
powershell -ExecutionPolicy Bypass -File .\scripts\start-green-roomz.ps1
#   … or plainly:  node .\bin\green-roomz.mjs serve
```

`start-green-roomz.ps1` bounces any existing listener on 8080 and opens a serve
console window that survives the parent.

Expose to one other host on the LAN — see [Peer access](#peer-access).

## Is it healthy?

```powershell
curl http://127.0.0.1:8080/health        # {"status":"ok"|"degraded", ...}
curl http://127.0.0.1:8080/v1/models      # the 11 aliases + availability
node .\e2e\verify-models.mjs               # cold-starts every backend, one real call each
```

`verify-models` is the real check — a green `/health` only means the gateway
process is up. It prints `PASS / WARN / SKIP / FAIL` per model and exits non-zero
on a hard failure.

- **`status: degraded`** is normal — it just means one or more backends are cold
  or their model file is missing. The gateway still serves everything else.
- A chat that dies with *"stream connection lost"* almost always means the
  selected specialist's backend is not answering. Check `/v1/models` for that
  alias, or just run `verify-models`. Switch the client's model picker to `auto`.

## Recover it

```powershell
# 1. backend wedged / gone — restart the whole thing
powershell -File .\scripts\start-green-roomz.ps1

# 2. one backend stuck — let it be evicted (idle) or bounce serve

# 3. gateway process gone — it exits(1) on an uncaught fault for a supervisor to
#    restart; unhandled promise rejections are logged and survived.
```

The gateway bounds every upstream call (`gateway.upstream_timeout_ms`, default
180 s) and caps buffered responses (8 MiB) so a stalled or broken backend
returns 502/504 instead of hanging the whole gateway.

## Memory

A 16 GB box cannot hold every model resident, and it does not have to.

- **Admission is advisory** — the gateway never refuses to load a model because
  free RAM is low. mmap'd weights + KV are reclaimable; the OS pages. Tight loads
  are flagged (`advisory` in `/v1/models`) but run.
- **KV cache defaults to `q8_0`** (near-lossless, ~half the KV bytes). Opt a
  profile/agent out with `"kv_cache": "f16"`.
- **Idle eviction** keeps only `max_warm_specialists` backends warm.

To trim further on a constrained host: lower `max_warm_specialists` to 2, drop
`idle_evict_ms` to 120000, and prefer the smaller model for a role in the
manifest (e.g. `qwen2.5-coder-1.5b` instead of the 7B).

## Peer access

The gateway answers loopback by default. To let **one** other host reach it:

```powershell
# manifest: "gateway": { "host": "192.168.1.251", "allow_peers": ["192.168.1.88"] }
#   or at launch:
node .\bin\green-roomz.mjs serve --host 192.168.1.251 --allow-peer 192.168.1.88
```

Every request from a non-loopback address not on `allow_peers` gets **403**.
Binding to `0.0.0.0` (all interfaces) still requires `GREEN_ROOMZ_ALLOW_PUBLIC=1`.
Layer `GREEN_ROOMZ_API_KEY` on top for bearer auth if the peer is not fully
trusted.

### adb-resolved peer (test harness)

`deploy/adb-peer.mjs` (harness, not baseline) uses adb as both authenticator and
authorizer: the Android device must be adb-attached and in the `device` state,
and only the device IP on a subnet this host and the device **share** is
trusted. Feed it in at launch:

```powershell
node .\bin\green-roomz.mjs serve --host <lan-ip> --allow-peer $(node .\deploy\adb-peer.mjs)
node .\deploy\adb-peer.mjs --describe   # what adb sees and why
```
