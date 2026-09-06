#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export GRZ_ROOT="$ROOT"
export GRZ_EXE="${GRZ_EXE-}"
exec node bin/green-roomz.mjs validate --manifest config/agents.cursor.json
