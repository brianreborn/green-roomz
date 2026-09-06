#!/bin/bash
set -euo pipefail
cd /workspace/green-roomz
status=0
for f in test/*.test.mjs; do
  echo RUN "$f"
  /usr/bin/node "$f" || status=1
done
exit $status
