#!/usr/bin/env bash
set -euo pipefail
echo "== health =="
curl -sS http://127.0.0.1:8080/health | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('product'), d.get('status'))"
echo "== ping =="
curl -sS http://127.0.0.1:8080/v1/chat/completions \
  -H 'content-type: application/json' \
  -d '{"messages":[{"role":"user","content":"Reply with exactly the word: pong"}],"max_tokens":24}'
echo
