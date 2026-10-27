#!/usr/bin/env bash
# Local operator board. Stdout / file only. Never scrape PIDs into an HTTP endpoint.
set -euo pipefail
GRZ_ROOT="${GRZ_ROOT:-$(cd "$(dirname "$0")" && pwd)}"
USAGE_FILE="${USAGE_FILE:-$GRZ_ROOT/data/operator-usage.json}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:8080/health}"
ONCE="${CONSOLE_ONCE:-0}"

listen_pid() {
  local port="$1"
  local pid=""
  if command -v ss >/dev/null 2>&1; then
    pid="$(ss -tlnp 2>/dev/null | python3 -c "
import sys, re
port = int(sys.argv[1])
pat = re.compile(r'pid=(\d+)')
for line in sys.stdin:
    if 'LISTEN' not in line:
        continue
    if re.search(r'[:.]%d(?:\s|$)' % port, line):
        m = pat.search(line)
        if m:
            print(m.group(1))
            break
" "$port" 2>/dev/null || true)"
  fi
  if [[ -z "${pid:-}" ]] && command -v lsof >/dev/null 2>&1; then
    pid="$(lsof -ti tcp:"$port" -sTCP:LISTEN 2>/dev/null | head -1 || true)"
  fi
  if [[ -z "${pid:-}" ]] && command -v fuser >/dev/null 2>&1; then
    pid="$(fuser "${port}/tcp" 2>/dev/null | awk '{print $1}' | head -1 || true)"
  fi
  printf '%s' "${pid:-}"
}

proc_line() {
  local label="$1" port="$2"
  local pid rss threads cpu rss_h
  pid="$(listen_pid "$port")"
  if [[ -z "$pid" ]]; then
    printf '%-5s :%s  pid=none  (not listening)\n' "$label" "$port"
    return
  fi
  rss="$(awk '/VmRSS:/{print $2}' "/proc/$pid/status" 2>/dev/null || true)"
  threads="$(awk '/Threads:/{print $2}' "/proc/$pid/status" 2>/dev/null || echo "?")"
  cpu="$(ps -p "$pid" -o pcpu= 2>/dev/null | awk '{print $1}')"
  rss_h="?"
  if [[ -n "${rss:-}" ]]; then
    rss_h="$(awk -v k="$rss" 'BEGIN{printf "%.0fMB", k/1024}')"
  fi
  printf '%-5s :%s  pid=%s  threads=%s  rss=%s  cpu=%s%%\n' "$label" "$port" "$pid" "$threads" "$rss_h" "${cpu:-?}"
}

model_line() {
  python3 - "$GRZ_ROOT" <<'PY'
import os, sys
root = sys.argv[1]
models = os.path.join(root, "models")
if not os.path.isdir(models):
    print("model: none (models/ absent)")
    raise SystemExit
ggufs = sorted(f for f in os.listdir(models) if f.endswith(".gguf"))
if not ggufs:
    print("model: none (no GGUF in models/)")
    raise SystemExit
for name in ggufs:
    p = os.path.join(models, name)
    try:
        sz = os.path.getsize(p)
        shown = "{:.0f}MB".format(sz / 1024 / 1024) if sz >= 1024 * 1024 else "{}B".format(sz)
    except OSError:
        shown = "?"
    print("model: {} {}".format(name, shown))
PY
}

health_line() {
  python3 - "$HEALTH_URL" <<'PY'
import json, sys, urllib.request
url = sys.argv[1]
try:
    with urllib.request.urlopen(url, timeout=2) as r:
        raw = r.read(8000)
    d = json.loads(raw.decode("utf-8", "replace"))
except Exception as e:
    print("health: unreachable ({})".format(type(e).__name__))
    raise SystemExit
status = d.get("status")
policy = d.get("policy")
ready = []
for a in d.get("agents") or []:
    st = (a.get("capability_readiness") or {}).get("state") or a.get("availability")
    if st == "ready" or a.get("availability") == "ready":
        ready.append(a.get("id") or a.get("alias") or "?")
line = "health: status={} policy={} ready=[{}]".format(
    status, policy, ", ".join(ready) if ready else ""
)
print(line[:360] + ("..." if len(line) > 360 else ""))
PY
}

occupancy_line() {
  python3 - "$USAGE_FILE" <<'PY'
import json, os, sys
path = sys.argv[1]
unknown = "usage: unknown (drop data/operator-usage.json — do not guess)"
if not os.path.isfile(path):
    print(unknown)
    raise SystemExit
try:
    with open(path, "r", encoding="utf-8") as f:
        d = json.load(f)
except Exception:
    print("usage: unreadable (operator-usage.json present but not valid JSON — do not guess)")
    raise SystemExit
if not isinstance(d, dict):
    print("usage: unreadable (operator-usage.json is not an object — do not guess)")
    raise SystemExit

def take_int(key):
    if key not in d:
        return None
    v = d[key]
    if isinstance(v, bool) or v is None:
        return None
    if isinstance(v, int):
        return v
    return None

def take_num(key):
    if key not in d:
        return None
    v = d[key]
    if v is None or isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return v
    return None

parts = []
src = d.get("source")
if isinstance(src, str) and src:
    parts.append("source={}".format(src))
for key in ("prompt_tokens", "completion_tokens", "total_tokens"):
    v = take_int(key)
    if v is not None:
        parts.append("{}={}".format(key, v))
if "context_fill_pct" in d:
    fill = take_num("context_fill_pct")
    if fill is None:
        parts.append("total cache fill L0-L3=null")
    else:
        parts.append("total cache fill L0-L3={}%".format(fill))
if not parts:
    print("usage: operator-usage.json present but no token/fill fields — do not guess")
else:
    print("usage: " + " ".join(parts) + "  (70% hold is L0+L1+L2+L3 combined, not L0 alone)")
PY
}

board() {
  local host pt utc
  host="$(hostname 2>/dev/null || echo unknown)"
  pt="$(TZ=America/Los_Angeles date '+%Y-%m-%d %H:%M:%S %Z' 2>/dev/null || date -u '+%Y-%m-%d %H:%M:%S UTC')"
  utc="$(TZ=UTC date -u '+%Y-%m-%d %H:%M:%S UTC' 2>/dev/null || date -u '+%Y-%m-%d %H:%M:%S UTC')"
  echo "Green-Roomz console  beta-0.1"
  echo "host: $host"
  echo "time: $pt  |  $utc"
  echo "GRZ_ROOT: $GRZ_ROOT"
  proc_line "node" 8080
  proc_line "llama" 8187
  model_line
  health_line
  occupancy_line
}

if [[ "$ONCE" == "1" ]]; then
  board
  exit 0
fi
while true; do
  board
  echo "---- every 2s; CONSOLE_ONCE=1 for one shot; Ctrl-C to quit ----"
  sleep 2
done
