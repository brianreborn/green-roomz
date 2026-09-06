#!/bin/bash
set -euo pipefail
cd /workspace/green-roomz
exec node bin/green-roomz.mjs validate --manifest config/agents.cursor.json
