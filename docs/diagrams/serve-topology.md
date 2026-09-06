# Serve topology — gateway :8080, llama :8187, console, usage

Live loopback topology. Do **not** stop listeners on `:8080` / `:8187` from a
docs edit or from a Windows `stop.cmd` aimed at this Linux cursor serve.

Canonical ops: [`../deployment.md`](../deployment.md). Console: `console.sh`
(`grz-console(1)`). Occupancy: `data/operator-usage.json` only.

```mermaid
flowchart TB
  OP["Operator / client"]
  HELP["Windows start: help\\index.html<br/>Unix: man green-roomz / man grz-console"]

  subgraph loopback ["127.0.0.1"]
    GW["Node gateway<br/>bin/green-roomz.mjs serve<br/>:8080"]
    NX["llama-server nexus<br/>tool-router-agent<br/>:8187  — resident CPU, --device none"]
    COLD["Other specialists :8181–8186, :8188–8190<br/>cold-start on first use; idle-evict"]
  end

  CONS["console.sh  (local stdout board)<br/>every 2s; CONSOLE_ONCE=1 for one shot<br/>never scrapes PIDs into an HTTP endpoint"]
  USAGE["data/operator-usage.json<br/>operator drop-in — do not invent fill"]
  LOG["data/serve.log<br/>attachServeConsole tees TTY + file"]
  HEALTH["GET /health  GET /v1/models<br/>GET /metrics  GET /props"]

  OP --> HELP
  OP --> GW
  OP --> CONS
  CONS --> USAGE
  CONS --> HEALTH
  CONS --> GW
  CONS --> NX
  GW --> NX
  GW --> COLD
  GW --> LOG
  GW --> HEALTH
```

## Ports (this pack)

| Port | Process | Role |
|---|---|---|
| **8080** | `node` (`green-roomz serve`) | OpenAI-compatible gateway. The only thing clients talk to. |
| **8187** | `llama-server` | Resident 0.5B CPU nexus (`tool-router-agent`). Pre-warmed at serve start. |
| 8181–8186, 8188–8190 | specialists | Cold-start; not required for the nexus path. Missing artifacts → degraded health, not a dead gateway. |
| — | `security-monitor-agent` | Logical; no process. See security-monitor docs. |

Default bind is loopback. Public bind requires `GREEN_ROOMZ_API_KEY` and
`GREEN_ROOMZ_ALLOW_PUBLIC=1`. Peer LAN: `--allow-peer <ip>`.

## Console data path

`console.sh` prints, it does not serve:

1. `node :8080` pid / threads / rss / cpu (from the listen table + `/proc`)
2. `llama :8187` same
3. GGUF names under `models/` (size from `stat`, not occupancy)
4. `GET http://127.0.0.1:8080/health` (status / policy / ready aliases)
5. Occupancy **only** from `data/operator-usage.json`

If the usage file is missing, the board says `usage: unknown … do not guess`.
The 70% hold printed next to a real `context_fill_pct` is
**L0+L1+L2+L3 combined**, not L0 alone.

```mermaid
sequenceDiagram
  participant Op as Operator
  participant Cons as console.sh
  participant File as operator-usage.json
  participant GW as gateway :8080
  participant NX as llama :8187
  Op->>Cons: CONSOLE_ONCE=1 or watch every 2s
  Cons->>File: read JSON (or unknown)
  Cons->>GW: GET /health (2s timeout)
  Note over Cons,NX: listen table for :8080 and :8187 only
  Cons-->>Op: stdout board (never invent fill)
```

## Process ownership

The gateway owns backends it started. `green-roomz stop` / `stop.sh` drains
**owned** processes. Do not use Windows `stop.cmd` against this Linux serve.
Do not `kill` unrelated `node` or `llama-server` PIDs.
