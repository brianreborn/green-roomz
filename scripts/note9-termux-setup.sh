#!/usr/bin/env bash
# Portable shebang (NewTermux may use a non-com.termux $PREFIX). Invoke as: bash <script>.sh
: "${LANG:=C.UTF-8}"; export LANG
# Green-Roomz Note9 Termux setup — no root
# Runtime is copied into $HOME because SELinux blocks executing /data/local/tmp.
set -uo pipefail
umask 077
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

HOME_GRZ="$HOME/green-roomz"
RT="$HOME/grz-runtime"
mkdir -p "$HOME_GRZ" "$RT/bin" "$RT/lib" "$RT/models"

echo "=== locate staged JS tree ==="
if [[ -d $SRC_TMP/green-roomz ]]; then TREE_SRC=$SRC_TMP/green-roomz
elif [[ -d $SD/green-roomz ]]; then TREE_SRC=$SD/green-roomz
else echo "ERROR: no green-roomz tree"; exit 1; fi

echo "=== copy + verify native runtime into \$HOME (never executed from $SRC_TMP) ==="
# Manifest ships in the cut: $HOME_GRZ/config/note9-runtime.SHA256SUMS (GRZ_RUNTIME_SUMS may
# override, only with a file inside $HOME_GRZ), anchored by GRZ_MANIFEST_SHA256. Only listed
# files are copied (runtime + JS tree). The verifier runs via bash from the staged tree before
# anything is trusted; bash reads it, nothing is exec'd from $SRC_TMP. See docs/note9-termux.md.
bash "$TREE_SRC/scripts/note9-verify-runtime.sh" "$SRC_TMP" "$TREE_SRC" "$RT" "$HOME_GRZ" || exit 1

cat > "$RT/run-llama-server.sh" <<'WRAP'
#!/usr/bin/env bash
# Delegates to the cut runner: checks $HOME/grz-runtime/.verified, sets LD_LIBRARY_PATH=$RT/bin.
exec bash "${HOME}/green-roomz/scripts/note9-run-llama-server.termux.sh" "$@"
WRAP
chmod 755 "$RT/run-llama-server.sh"

test -x "$RT/run-llama-server.sh" || { echo "ERROR: wrap not executable at $RT/run-llama-server.sh"; exit 1; }
test -x "$RT/bin/llama-server" || { echo "ERROR: llama-server not executable at $RT/bin/llama-server"; ls -la "$RT/bin"; exit 1; }
"$RT/run-llama-server.sh" --version | head -3 || echo "WARN: version probe failed"

# Point manifest at copied model if present
MAN="$HOME_GRZ/config/agents.note9.json"
if [[ -f $RT/models/Qwenstral-Small-3.1-0.5B.Q4_K_M.gguf ]]; then
  # shellcheck disable=SC2016 # literal ${HOME}; expanded by the manifest loader
  sed -i 's#/data/local/tmp/grz/models/Qwenstral-Small-3.1-0.5B.Q4_K_M.gguf#${HOME}/grz-runtime/models/Qwenstral-Small-3.1-0.5B.Q4_K_M.gguf#g' "$MAN"
fi

test -f "$HOME_GRZ/bin/green-roomz.mjs"
test -f "$MAN"

export GRZ_ROOT="$HOME_GRZ"
export LD_LIBRARY_PATH="$RT/lib:$RT/bin${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
cd "$HOME_GRZ" || exit 1

echo "=== validate ==="
node ./bin/green-roomz.mjs validate --manifest ./config/agents.note9.json | tee "$HOME/grz-validate.json"

# shellcheck source=note9-serve-pid.sh
. "$HOME_GRZ/scripts/note9-serve-pid.sh"
grz_stop_serve

echo "=== serve ==="
nohup node ./bin/green-roomz.mjs serve --manifest ./config/agents.note9.json --host 127.0.0.1 --port 8080 \
  >"$HOME/grz-serve.out.log" 2>"$HOME/grz-serve.err.log" &
echo "serve_pid=$!"
grz_write_pid "$!"

ok=0
for _ in $(seq 1 90); do
  if node -e "fetch('http://127.0.0.1:8080/v1/models').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; then
    ok=1
    break
  fi
  sleep 2
done

echo "gateway_ready=$ok"
if [[ "$ok" -eq 1 ]]; then
  node -e "fetch('http://127.0.0.1:8080/v1/models').then(async r=>console.log(await r.text())).catch(e=>console.error(e))" || true
fi
if [[ "${GRZ_SDCARD_LOGS:-0}" == 1 ]]; then
  cp "$HOME/grz-serve.out.log" "$SD/serve.out.log" 2>/dev/null || true
  cp "$HOME/grz-serve.err.log" "$SD/serve.err.log" 2>/dev/null || true
fi
echo "=== DONE ok=$ok ==="
