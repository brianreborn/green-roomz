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

echo "=== copy JS tree ==="
if [[ -d $SRC_TMP/green-roomz ]]; then
  cp -a "$SRC_TMP/green-roomz/." "$HOME_GRZ/"
elif [[ -d $SD/green-roomz ]]; then
  cp -a "$SD/green-roomz/." "$HOME_GRZ/"
else
  echo "ERROR: no green-roomz tree"
  exit 1
fi

echo "=== copy native runtime into \$HOME (executable) ==="
cp -a "$SRC_TMP/bin/llama-server" "$SRC_TMP/bin/llama-cli" "$SRC_TMP/bin/llama-bench" "$RT/bin/" 2>/dev/null || true
cp -a "$SRC_TMP/lib/"*.so "$RT/lib/"
cp -a "$SRC_TMP/bin/"libggml-cpu-*.so "$RT/bin/" 2>/dev/null || true
cp -a "$SRC_TMP/bin/libggml-base.so" "$SRC_TMP/bin/libggml.so" "$SRC_TMP/bin/libc++_shared.so" "$RT/bin/" 2>/dev/null || true
# model: prefer tmp (already on device); copy only if missing in runtime
if [[ ! -f $RT/models/Qwenstral-Small-3.1-0.5B.Q4_K_M.gguf ]]; then
  if [[ -f $SRC_TMP/models/Qwenstral-Small-3.1-0.5B.Q4_K_M.gguf ]]; then
    echo "copying GGUF into \$HOME (may take a minute)..."
    cp -a "$SRC_TMP/models/Qwenstral-Small-3.1-0.5B.Q4_K_M.gguf" "$RT/models/" || \
      ln -sf "$SRC_TMP/models/Qwenstral-Small-3.1-0.5B.Q4_K_M.gguf" "$RT/models/" || true
  fi
fi
# Optional integrity check of the copied native runtime. SUMS entries are
# relative to $HOME/grz-runtime (e.g. "bin/llama-server", "lib/libfoo.so").
SUMS="${GRZ_RUNTIME_SUMS:-}"
if [[ -z $SUMS && -f /workspace/reviews/release/note9-runtime-SHA256SUMS ]]; then
  SUMS=/workspace/reviews/release/note9-runtime-SHA256SUMS
fi
if [[ -n $SUMS ]]; then
  echo "=== verify runtime against $SUMS ==="
  if [[ ! -f $SUMS ]]; then echo "ERROR: GRZ_RUNTIME_SUMS=$SUMS not found; refusing"; exit 1; fi
  if ! (cd "$RT" && sha256sum -c --strict "$SUMS"); then
    echo "ERROR: runtime checksum mismatch; refusing to continue"; exit 1
  fi
fi
chmod 755 "$RT/bin/llama-server" "$RT/bin/llama-cli" "$RT/bin/llama-bench" 2>/dev/null || true

cat > "$RT/run-llama-server.sh" <<'WRAP'
#!/usr/bin/env bash
export LD_LIBRARY_PATH="${HOME}/grz-runtime/lib:${HOME}/grz-runtime/bin:${LD_LIBRARY_PATH:-}"
cd "${HOME}/grz-runtime"
exec "${HOME}/grz-runtime/bin/llama-server" "$@"
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

pkill -f 'green-roomz.mjs serve' 2>/dev/null || true
sleep 1

echo "=== serve ==="
nohup node ./bin/green-roomz.mjs serve --manifest ./config/agents.note9.json --host 127.0.0.1 --port 8080 \
  >"$HOME/grz-serve.out.log" 2>"$HOME/grz-serve.err.log" &
echo "serve_pid=$!"
echo $! >"$HOME/grz-serve.pid"
cp "$HOME/grz-serve.pid" "$SD/serve.pid" 2>/dev/null || true

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
