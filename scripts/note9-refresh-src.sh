#!/usr/bin/env bash
# Portable shebang (NewTermux may use a non-com.termux $PREFIX). Invoke as: bash <script>.sh
: "${LANG:=C.UTF-8}"; export LANG
# Refresh = a new cut through verify + flip. Nothing is copied into the live tree: the staged
# runtime + tree (/data/local/tmp/grz) go through note9-verify-runtime.sh, anchored by
# GRZ_MANIFEST_SHA256, into a new $HOME/grz.<sha>; grz.current flips only on success. Then serve
# restarts from grz.current. The verifier used is the one inside the currently verified tree.
set -euo pipefail
umask 077
ST=${GRZ_STAGE_ROOT:-/data/local/tmp/grz}
SELF_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=note9-common.sh
. "$SELF_DIR/note9-common.sh"
grz_sdk_check || exit 1
grz_state_init || exit 1
[[ -n ${GRZ_MANIFEST_SHA256:-} ]] || { echo "ERROR: GRZ_MANIFEST_SHA256 unset; refresh needs the new cut's manifest hash (out of band)" >&2; exit 1; }
grz_resolve_current || exit 1
VERIFY="$GRZ_TREE/scripts/note9-verify-runtime.sh"
[[ -f $VERIFY ]] || { echo "ERROR: $VERIFY missing in verified tree" >&2; exit 1; }
# GRZ_STAGE_ROOT is an input only: classify it with the shared-storage helper and make sure
# nothing we execute (the verifier) lives under it.
ST_REAL=$("$REALPATH" -e -- "$ST") || { echo "ERROR: stage root $ST missing" >&2; exit 1; }
if grz_is_shared_storage "$ST_REAL"; then echo "stage root $ST_REAL is on shared storage (input only; never executed)"; fi
VERIFY_REAL=$("$REALPATH" -e -- "$VERIFY")
if [[ $VERIFY_REAL == "$ST_REAL"/* ]]; then echo "ERROR: verifier $VERIFY_REAL is inside stage root $ST_REAL; refusing" >&2; exit 1; fi
[[ -d $ST/green-roomz ]] || { echo "ERROR: no staged tree at $ST/green-roomz" >&2; exit 1; }
bash "$VERIFY" "$ST" "$ST/green-roomz" || { echo "ERROR: verify failed; grz.current unchanged" >&2; exit 1; }
grz_resolve_current || exit 1
echo "refreshed: grz.current -> $GRZ_DIR"
[[ ${GRZ_REFRESH_NO_RESTART:-0} == 1 ]] && exit 0
exec bash "$GRZ_TREE/scripts/note9-restart-serve.sh"
