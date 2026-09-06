#!/usr/bin/env bash
set -euo pipefail
# PF1: reap owned gateway + llama ports from pidfile/children or manifest ports. No GNU xargs -r.
export GRZ_ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$GRZ_ROOT"
DATA="$GRZ_ROOT/data"
PIDFILE="$DATA/serve.pid"
CHILDREN="$DATA/children.json"

reap_port() {
  local p="$1"
  if command -v fuser >/dev/null 2>&1; then
    fuser -k "${p}/tcp" 2>/dev/null || true
  elif command -v lsof >/dev/null 2>&1; then
    # Portable: no xargs -r (GNU-only)
    local pids
    pids="$(lsof -ti tcp:"$p" 2>/dev/null || true)"
    if [[ -n "${pids}" ]]; then
      # shellcheck disable=SC2086
      kill ${pids} 2>/dev/null || true
    fi
  fi
}

if [[ -f "$PIDFILE" ]]; then
  gw="$(tr -d ' \n\r\t' < "$PIDFILE" || true)"
  if [[ -n "$gw" ]]; then
    kill -TERM "$gw" 2>/dev/null || true
  fi
fi

if [[ -f "$CHILDREN" ]]; then
  # Reap by PID from children.json when present
  if command -v node >/dev/null 2>&1; then
    node -e '
      const fs=require("fs");
      let rows=[];
      try { rows=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); } catch {}
      for (const r of Array.isArray(rows)?rows:[]) {
        const pid=Number(r&&r.pid);
        if (Number.isFinite(pid)&&pid>0) {
          try { process.kill(pid,"SIGTERM"); } catch {}
        }
      }
    ' "$CHILDREN" || true
  fi
fi

sleep 1

# Owned manifest llama ports 8181-8187 plus gateway 8080 (never image-kill foreign llama)
for p in 8080 8181 8182 8183 8184 8185 8186 8187; do
  reap_port "$p"
done

sleep 1
# Second pass if still bound
for p in 8080 8181 8182 8183 8184 8185 8186 8187; do
  reap_port "$p"
done

rm -f "$PIDFILE" "$CHILDREN" 2>/dev/null || true
echo "stopped"
