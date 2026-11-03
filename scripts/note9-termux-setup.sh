#!/usr/bin/env bash
# Portable shebang (NewTermux may use a non-com.termux $PREFIX). Invoke as: bash <script>.sh
: "${LANG:=C.UTF-8}"; export LANG
# Green-Roomz Note9 Termux setup — no root
# Runtime is copied into $HOME because SELinux blocks executing /data/local/tmp.
set -uo pipefail
umask 077
# Android 9 (API 28) minimum: the runtime is built for NDK API 28. Skipped when getprop is
# absent (off-device tests).
if command -v getprop >/dev/null 2>&1; then
  sdk=$(getprop ro.build.version.sdk 2>/dev/null | tr -d '[:space:]')
  if [[ $sdk =~ ^[0-9]+$ ]] && (( sdk < 28 )); then
    echo "ERROR: Android SDK $sdk detected; this build needs Android 9 (API 28) or later" >&2; exit 1
  fi
fi
SD=/sdcard/Download/grz
SRC_TMP=/data/local/tmp/grz
LOG=$HOME/grz-setup.log
mkdir -p "$SD" "$HOME"
# Pre-existing logs may predate umask 077: tighten them.
for f in "$LOG" "$HOME/grz-serve.out.log" "$HOME/grz-serve.err.log" "$HOME/grz-validate.json" "$HOME/grz-serve.pid"; do
  [[ -e $f ]] && chmod 600 "$f"
done
# /sdcard is shared storage: any app with storage permission can read it.
# Full logs stay in Termux $HOME (0600); mirror to /sdcard only on explicit opt-in.
if [[ "${GRZ_SDCARD_LOGS:-0}" == 1 ]]; then
  exec > >(tee -a "$LOG" | tee -a "$SD/setup.log") 2>&1
else
  exec > >(tee -a "$LOG") 2>&1
fi
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

CUR="$HOME/grz.current"
HOME_GRZ="$CUR/tree"
RT="$CUR/runtime"
# User state (.git, local config, 0600 override): never inside the versioned folder.
STATE="$HOME/.green-roomz-state"
[[ -L $STATE ]] && { echo "ERROR: $STATE is a symlink; refusing"; exit 1; }
mkdir -p "$STATE" && chmod 700 "$STATE"

# Crash recovery: grz.current must name grz.<sha> whose .verified and manifest agree. If not
# (crash mid-flip), drop the link so the runner refuses until verify succeeds.
if [[ -L $CUR ]]; then
  _d=$(realpath -e -- "$CUR" 2>/dev/null || true); _hex=${_d##*/grz.}
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
GRZ_OVR_PORT=$PORT GRZ_OVR_LOG="${GRZ_SDCARD_LOGS:-0}" GRZ_OVR_OUT="$OVR" node -e '
const fs = require("fs");
const o = { port: Number(process.env.GRZ_OVR_PORT), log_opt_in: process.env.GRZ_OVR_LOG === "1" };
const out = process.env.GRZ_OVR_OUT, tmp = out + ".tmp." + process.pid;
fs.writeFileSync(tmp, JSON.stringify(o, null, 2) + "\n", { mode: 0o600, flag: "wx" });
fs.chmodSync(tmp, 0o600);
fs.renameSync(tmp, out);
' || { echo "ERROR: writing $OVR failed"; exit 1; }

test -f "$HOME_GRZ/bin/green-roomz.mjs"
test -f "$MAN"

export GRZ_ROOT="$HOME_GRZ"
unset LD_LIBRARY_PATH  # the runner sets exactly runtime/bin
cd "$HOME_GRZ" || exit 1

echo "=== validate ==="
node ./bin/green-roomz.mjs validate --manifest ./config/agents.note9.json | tee "$HOME/grz-validate.json"

# shellcheck source=note9-serve-pid.sh
. "$HOME_GRZ/scripts/note9-serve-pid.sh"
grz_stop_serve

echo "=== serve ==="
nohup node ./bin/green-roomz.mjs serve --manifest ./config/agents.note9.json --host 127.0.0.1 --port "$PORT" \
  >"$HOME/grz-serve.out.log" 2>"$HOME/grz-serve.err.log" &
echo "serve_pid=$!"
grz_write_pid "$!"

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
if [[ "${GRZ_SDCARD_LOGS:-0}" == 1 ]]; then
  cp "$HOME/grz-serve.out.log" "$SD/serve.out.log" 2>/dev/null || true
  cp "$HOME/grz-serve.err.log" "$SD/serve.err.log" 2>/dev/null || true
fi
echo "=== DONE ok=$ok ==="
