#!/usr/bin/env bash
# Optional diagnostic only — not a gate before ./start.sh / cursor-serve.sh.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export GRZ_ROOT="$ROOT"
export GRZ_EXE="${GRZ_EXE-}"
exec node bin/green-roomz.mjs validate --manifest config/agents.cursor.json
