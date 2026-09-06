#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
status=0
for f in test/*.test.mjs; do
  echo RUN "$f"
  /usr/bin/node --test "$f" || status=1
done
exit $status
