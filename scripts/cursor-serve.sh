#!/bin/bash
set -euo pipefail
cd /workspace/green-roomz
export LD_LIBRARY_PATH=/workspace/green-roomz/runtime
exec node bin/green-roomz.mjs serve --manifest config/agents.cursor.json --host 127.0.0.1 --port 8080
