#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export GRZ_ROOT="$ROOT"
export GRZ_EXE="${GRZ_EXE-}"
export GRZ_LLAMA="${GRZ_LLAMA:-$ROOT/runtime/llama-server}"
export LD_LIBRARY_PATH="$ROOT/runtime${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
exec node bin/green-roomz.mjs serve --manifest config/agents.cursor.json --host 127.0.0.1 --port 8080
