#!/usr/bin/env bash
# Portable shebang (NewTermux may use a non-com.termux $PREFIX). Invoke as: bash <script>.sh
: "${LANG:=C.UTF-8}"; export LANG
# Green-Roomz Note9 Termux setup — no root
# Runtime is copied into $HOME because SELinux blocks executing /data/local/tmp.
set -uo pipefail
umask 077
SELF_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=note9-common.sh
. "$SELF_DIR/note9-common.sh"
# Android 9 (API 28) minimum (NDK API 28 build). See grz_sdk_check: refuses on empty/non-numeric
# getprop, or missing getprop under Termux; skipped only on non-Android hosts.
grz_sdk_check || exit 1
HOME_REAL=$("$REALPATH" -e -- "$HOME") || { echo "ERROR: HOME missing" >&2; exit 1; }
if grz_is_shared_storage "$HOME_REAL"; then echo "ERROR: HOME $HOME_REAL is on shared storage; refusing" >&2; exit 1; fi
SD=/sdcard/Download/grz   # staged-tree fallback location only; nothing is ever written there
SRC_TMP=/data/local/tmp/grz
grz_state_init || exit 1
STATE=$GRZ_STATE
# Logs: off by default. GRZ_LOG_OPT_IN=1 -> $STATE/logs/*.log (600); never /sdcard.
LOG_OPT_IN=0; [[ ${GRZ_LOG_OPT_IN:-0} == 1 ]] && LOG_OPT_IN=1
LOG=$(grz_log_path setup "$LOG_OPT_IN")
if [[ $LOG != /dev/null ]]; then exec > >(tee -a "$LOG") 2>&1; fi
echo "=== note9 setup $(date -Is 2>/dev/null || date) ==="
echo "uid=$(id)"
echo "HOME=$HOME PREFIX=${PREFIX:-}"

# Removing apt source lists is a persistent host change: opt-in only, and needs
# Brian's per-host OK before anyone sets GRZ_PRUNE_APT_SOURCES=1.
if [[ "${GRZ_PRUNE_APT_SOURCES:-0}" == 1 ]]; then
  echo "pruning game/science/unstable apt source lists (GRZ_PRUNE_APT_SOURCES=1)"
  rm -f "$PREFIX/etc/apt/sources.list.d/game.list" \
        "$PREFIX/etc/apt/sources.list.d/science.list" \
        "$PREFIX/etc/apt/sources.list.d/unstable.list" 2>/dev/null || true
fi

export DEBIAN_FRONTEND=noninteractive
if ! command -v node >/dev/null 2>&1; then
  pkg update -y || true
  pkg install -y nodejs
fi
echo "node=$(command -v node) $(node -v || true)"
command -v node >/dev/null || { echo "ERROR: nodejs install failed"; exit 1; }

CUR="$GRZ_CUR"
HOME_GRZ="$CUR/tree"
RT="$CUR/runtime"

# Crash recovery: grz.current must name grz.<sha> whose .verified and manifest agree. If not
# (crash mid-flip), drop the link so the runner refuses until verify succeeds.
if [[ -L $CUR ]]; then
  _d=$("$REALPATH" -e -- "$CUR" 2>/dev/null || true); _hex=${_d##*/grz.}
  _man="$_d/tree/config/note9-runtime.SHA256SUMS"; _cur=""
  [[ -f $_man ]] && _cur=$(sha256sum < "$_man" | cut -d' ' -f1)
  _st=""; [[ -f $_d/.verified ]] && _st=$(tr -d '[:space:]' < "$_d/.verified")
  if [[ -z $_cur || $_st != "$_cur" || $_hex != "$_cur" ]]; then
    echo "WARN: $CUR ($_d) stamp/manifest/folder disagree (crash mid-swap?); removing link, re-verifying" >&2
    rm -f -- "$CUR"
  fi
fi

echo "=== locate staged JS tree ==="
if [[ -d $SRC_TMP/green-roomz ]]; then TREE_SRC=$SRC_TMP/green-roomz
elif [[ -d $SD/green-roomz ]]; then TREE_SRC=$SD/green-roomz
else echo "ERROR: no green-roomz tree"; exit 1; fi

echo "=== copy + verify native runtime into \$HOME (never executed from $SRC_TMP) ==="
# Manifest ships in the cut: tree/config/note9-runtime.SHA256SUMS, anchored by
# GRZ_MANIFEST_SHA256. Installs $HOME/grz.<sha>/{runtime,tree} and flips grz.current. Only listed
# files are copied (runtime + JS tree). The verifier runs via bash from the staged tree before
# anything is trusted; bash reads it, nothing is exec'd from $SRC_TMP. See docs/note9-termux.md.
bash "$TREE_SRC/scripts/note9-verify-runtime.sh" "$SRC_TMP" "$TREE_SRC" || exit 1

RUNNER="$HOME_GRZ/scripts/note9-run-llama-server.termux.sh"
test -x "$RUNNER" || { echo "ERROR: runner not executable at $RUNNER"; exit 1; }
test -x "$RT/bin/llama-server" || { echo "ERROR: llama-server not executable at $RT/bin/llama-server"; ls -la "$RT/bin"; exit 1; }
"$RUNNER" --version | head -3 || echo "WARN: version probe failed"

MAN="$HOME_GRZ/config/agents.note9.json"
# Host-specific values go to an unlisted override (the verified manifest is never edited).
# Allowlisted keys only (port, api_key_file, log_opt_in); values pass via env to node and
# are JSON-encoded there, never through sed or a shell. tmp+mv, mode 600.
PORT=${GRZ_PORT:-8080}
[[ $PORT =~ ^[0-9]+$ ]] || { echo "ERROR: GRZ_PORT must be numeric"; exit 1; }
OVR="$STATE/agents.note9.local.json"
GRZ_OVR_PORT=$PORT GRZ_OVR_LOG="$LOG_OPT_IN" GRZ_OVR_OUT="$OVR" node -e '
const fs = require("fs");
const o = { port: Number(process.env.GRZ_OVR_PORT), log_opt_in: process.env.GRZ_OVR_LOG === "1" };
const out = process.env.GRZ_OVR_OUT, tmp = out + ".tmp." + process.pid;
fs.writeFileSync(tmp, JSON.stringify(o, null, 2) + "\n", { mode: 0o600, flag: "wx" });
fs.chmodSync(tmp, 0o600);
fs.renameSync(tmp, out);
' || { echo "ERROR: writing $OVR failed"; exit 1; }

test -f "$HOME_GRZ/bin/green-roomz.mjs"
test -f "$MAN"

grz_resolve_current || exit 1
export GRZ_ROOT="$GRZ_TREE"
unset LD_LIBRARY_PATH  # the runner sets exactly runtime/bin
cd "$GRZ_TREE" || exit 1

echo "=== validate ==="
VAL=$(grz_log_path validate "$LOG_OPT_IN")
node ./bin/green-roomz.mjs validate --manifest ./config/agents.note9.json | tee -a "$VAL"

# shellcheck source=note9-serve-pid.sh
. "$GRZ_TREE/scripts/note9-serve-pid.sh"
grz_stop_serve

echo "=== serve ==="
grz_serve_start "$PORT" "$LOG_OPT_IN"
echo "serve_pid=$GRZ_SERVE_PID"

ok=0
for _ in $(seq 1 90); do
  if node -e "fetch('http://127.0.0.1:$PORT/v1/models').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; then
    ok=1
    break
  fi
  sleep 2
done

echo "gateway_ready=$ok"
if [[ "$ok" -eq 1 ]]; then
  node -e "fetch('http://127.0.0.1:$PORT/v1/models').then(async r=>console.log(await r.text())).catch(e=>console.error(e))" || true
fi
echo "=== DONE ok=$ok ==="
