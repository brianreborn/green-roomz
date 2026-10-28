#!/usr/bin/env bash
# install.sh — Linux happy-path prep only. No serve, no fetch, no GGUF download.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

if ! command -v node >/dev/null 2>&1; then
  echo "Need Node.js on PATH (engines >=22; Node 20 works): https://nodejs.org/" >&2
  exit 1
fi

for f in install.sh start.sh stop.sh smoke.sh console.sh deploy-android.sh termux-start.sh scripts/grz-doctor.sh scripts/fetch-linux-aarch64.sh; do
  if [[ -f "$ROOT/$f" ]]; then
    chmod +x "$ROOT/$f" 2>/dev/null || true
  fi
done
if [[ -f "$ROOT/runtime/llama-server" ]]; then
  chmod +x "$ROOT/runtime/llama-server" 2>/dev/null || true
fi
if [[ -f "$ROOT/runtime/linux-aarch64/llama-server" ]]; then
  chmod +x "$ROOT/runtime/linux-aarch64/llama-server" 2>/dev/null || true
fi

echo "Green-Roomz install prep (detect-only)"
echo "node=$(command -v node) $(node -v 2>/dev/null || true)"
echo

if [[ ! -x "$ROOT/scripts/grz-doctor.sh" ]]; then
  echo "Missing scripts/grz-doctor.sh" >&2
  exit 1
fi

set +e
bash "$ROOT/scripts/grz-doctor.sh"
doc=$?
set -e

echo
if [[ "$doc" -eq 0 ]]; then
  echo "Ready. Start with: ./start.sh"
  echo "Gateway: http://127.0.0.1:8080"
  exit 0
fi

echo "Doctor reported gaps (exit $doc). Fix models_missing / llama, then re-run ./install.sh." >&2
echo "Slim pack: drop models/Qwenstral-Small-3.1-0.5B.Q4_K_M.gguf then retry." >&2
echo "Do not fetch GGUFs onto an 8600 GT." >&2
exit "$doc"
