#!/usr/bin/env bash
# Portable shebang (NewTermux may use a non-com.termux $PREFIX). Invoke as: bash <script>.sh
: "${LANG:=C.UTF-8}"; export LANG
# Restart serve only, from the verified tree resolved through $HOME/grz.current (no stored
# runtime path). To update sources use note9-refresh-src.sh (verify + flip).
set -euo pipefail
umask 077
SELF_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=note9-common.sh
. "$SELF_DIR/note9-common.sh"
grz_sdk_check || exit 1
grz_state_init || exit 1
grz_resolve_current || exit 1
# Helpers come from the verified tree, not from wherever this script was read.
# shellcheck source=note9-serve-pid.sh
. "$GRZ_TREE/scripts/note9-serve-pid.sh"
OPTIN=$(grz_log_opt_in "$GRZ_TREE") || { echo "ERROR: host override refused" >&2; exit 1; }
PORT=$(grz_port "$GRZ_TREE") || exit 1
grz_stop_serve
grz_serve_start "$PORT" "$OPTIN"
echo "serve_pid=$GRZ_SERVE_PID tree=$GRZ_TREE logs=$([[ $OPTIN == 1 ]] && echo "$GRZ_STATE/logs" || echo off)"
[[ ${GRZ_RESTART_NO_PROBE:-0} == 1 ]] && exit 0
sleep 10
node -e "fetch('http://127.0.0.1:$PORT/v1/models').then(async r=>console.log((await r.text()).slice(0,800)))" || true
echo RESTART_DONE
