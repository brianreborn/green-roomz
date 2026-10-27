# Deployment & operations

The one place that describes how Green-Roomz actually runs, how to tell it is
healthy, and how to recover it.

**Primary path (Linux x86_64):** [INSTALL.md](../INSTALL.md) — `./install.sh` then
`./start.sh`. This page is ops detail (ports, health, recovery, peers). Windows is
a sidecar at the end — not the default.

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

## Start it (Linux)

From a tip checkout or unzipped pack:

```bash
cd green-roomz
./install.sh          # detect-only doctor (no serve, no fetch)
./start.sh            # serves config/agents.cursor.json on 127.0.0.1:8080
```

`./start.sh` is enough to bring the gateway up. You do **not** need
`green-roomz validate` (or `npm run validate` / `scripts/cursor-validate.sh`)
before start — that CLI is optional / diagnostic. Serve loads the manifest
itself; missing specialty artifacts report degraded, they do not block the
gateway process.

Stop: `./stop.sh` or Ctrl-C in the serve terminal.

Expose to one other host on the LAN — see [Peer access](#peer-access).

## Is it healthy?

```bash
curl -s http://127.0.0.1:8080/health        # {"status":"ok"|"degraded", ...}
curl -s http://127.0.0.1:8080/v1/models     # the 11 aliases + availability
node ./e2e/verify-models.mjs                # cold-starts every backend, one real call each
```

`verify-models` is the real check — a green `/health` only means the gateway
process is up. It prints `PASS / WARN / SKIP / FAIL` per model and exits non-zero
on a hard failure.

- **`status: degraded`** is normal — it just means one or more backends are cold
  or their model file is missing. The gateway still serves everything else.
- A chat that dies with *"stream connection lost"* almost always means the
  selected specialist's backend is not answering. Check `/v1/models` for that
  alias, or just run `verify-models`. Switch the client's model picker to `auto`.

Optional diagnostic (not a start gate):

```bash
node bin/green-roomz.mjs validate --manifest config/agents.cursor.json
# or: scripts/cursor-validate.sh
```

## Recover it

```bash
# 1. backend wedged / gone — restart the whole thing
./stop.sh; ./start.sh

# 2. one backend stuck — let it be evicted (idle) or bounce serve

# 3. gateway process gone — it exits(1) on an uncaught fault for a supervisor to
#    restart; unhandled promise rejections are logged and survived.
```

The gateway bounds every upstream call (`gateway.upstream_timeout_ms`) and caps
buffered responses (8 MiB) so a stalled or broken backend returns 502/504 instead
of hanging the whole gateway.

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

```bash
# manifest: "gateway": { "host": "192.168.1.251", "allow_peers": ["192.168.1.88"] }
#   or at launch:
node bin/green-roomz.mjs serve --host 192.168.1.251 --allow-peer 192.168.1.88
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

```bash
node bin/green-roomz.mjs serve --host <lan-ip> --allow-peer "$(node ./deploy/adb-peer.mjs)"
node ./deploy/adb-peer.mjs --describe   # what adb sees and why
```

## Windows sidecar (not step 1)

On a Windows host use [INSTALL-WINDOWS.md](../INSTALL-WINDOWS.md) —
`install-windows.cmd` / `start.cmd`, or:

```powershell
# from your green-roomz checkout
powershell -ExecutionPolicy Bypass -File .\scripts\start-green-roomz.ps1
#   … or:  node .\bin\green-roomz.mjs serve
```

`start-green-roomz.ps1` bounces any existing listener on 8080 and opens a serve
console window that survives the parent. Model store layouts such as
`C:\LocalAI` are a Windows/shalom concern — see INSTALL-WINDOWS; they are not
part of the Linux happy path.
