# P0 bounce notes

- When: 2026-09-06 05:07:02 PT
- Tree: `/workspace/e2e-fresh/green-roomz` (overlaid src from `/workspace/green-roomz/src/`, plus `policies/frames/memory-feedback-loop.md`, `config/agents.cursor.json`)
- models/ runtime/ data/ preserved (not wiped)
- Did NOT use stop.sh; did NOT git commit; did NOT fuser -k 8187

## PIDs / ports

- Before: node gateway :8080 pid 1849424; llama-server :8187 pid 1903795; :8184 not listening
- Kill: TERM only 1849424 (exited ~2s). Gateway shutdown drained owned backends → old llama 1903795 exited with drain (not explicitly killed).
- After restart:
  - node gateway :8080 pid **1329948**
  - llama-server :8187 pid **1329974** (pre-warmed tool-router-agent)
  - :8184 still not listening

## Health snippet (GET /health)

```json
{
  "status": "degraded",
  "product": "Green-Roomz",
  "uptime_ms": 28345,
  "policy": "responsive",
  "tool-router-agent": {
    "availability": "ready",
    "resident": true,
    "ready_capabilities": [
      "text",
      "routing",
      "json"
    ]
  }
}
```

## P0 curl proofs (no exploit payloads)

- POST /v1/chat/completions/route {"messages":42}: HTTP 400 (expect 400) PASS
  body: `{"error":{"message":"messages must be an array","type":"validation_error"}}`
- POST /health: HTTP 405 (expect 405) PASS
  body: `{"error":{"message":"Method not allowed"}}`
- GET /health: HTTP 200 (expect 200) PASS
- POST /v1/chat/completions Content-Type: text/plain: HTTP 400 (expect 400) PASS
  body: `{"error":{"message":"Content-Type must be application/json","type":"validation_error"}}`

## Outcome

**bounce OK — P0 proofs live**
