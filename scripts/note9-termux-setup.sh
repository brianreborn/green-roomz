#!/data/data/com.termux/files/usr/bin/bash
# Green-Roomz Note9 Termux setup — no root
# Runtime is copied into $HOME because SELinux blocks executing /data/local/tmp.
set -uo pipefail
SD=/sdcard/Download/grz
SRC_TMP=/data/local/tmp/grz
LOG=$HOME/grz-setup.log
mkdir -p "$SD" "$HOME"
exec > >(tee -a "$LOG" | tee -a "$SD/setup.log") 2>&1
echo "=== note9 setup $(date -Is 2>/dev/null || date) ==="
echo "uid=$(id)"
echo "HOME=$HOME PREFIX=${PREFIX:-}"

rm -f "$PREFIX/etc/apt/sources.list.d/game.list" \
      "$PREFIX/etc/apt/sources.list.d/science.list" \
      "$PREFIX/etc/apt/sources.list.d/unstable.list" 2>/dev/null || true

export DEBIAN_FRONTEND=noninteractive
if ! command -v node >/dev/null 2>&1; then
  pkg update -y || true
  pkg install -y nodejs
fi
echo "node=$(command -v node) $(node -v || true)"
command -v node >/dev/null || { echo "ERROR: nodejs install failed"; exit 1; }

HOME_GRZ="$HOME/green-roomz"
RT="$HOME/grz-runtime"
mkdir -p "$HOME_GRZ" "$RT/bin" "$RT/lib" "$RT/models" "$RT/missing"

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
# PF-M3: copy ALL staged models (not nexus-only) from adb drop / sdcard staging
echo "=== copy models into \$HOME/grz-runtime/models (all files present) ==="
copied=0
for src_models in "$SRC_TMP/models" "$SD/models"; do
  [[ -d $src_models ]] || continue
  for f in "$src_models"/*; do
    [[ -f $f ]] || continue
    base="$(basename "$f")"
    if [[ ! -e $RT/models/$base ]]; then
      echo "copying model $base..."
      cp -a "$f" "$RT/models/" || ln -sf "$f" "$RT/models/" || true
      copied=$((copied + 1))
    fi
  done
done
echo "models_copied_new=$copied"
ls -la "$RT/models" 2>/dev/null | head -40 || true
chmod 755 "$RT/bin/llama-server" "$RT/bin/llama-cli" "$RT/bin/llama-bench" 2>/dev/null || true

cat > "$RT/run-llama-server.sh" <<'WRAP'
#!/data/data/com.termux/files/usr/bin/bash
export LD_LIBRARY_PATH="${HOME}/grz-runtime/lib:${HOME}/grz-runtime/bin:${LD_LIBRARY_PATH:-}"
cd "${HOME}/grz-runtime"
exec "${HOME}/grz-runtime/bin/llama-server" "$@"
WRAP
chmod 755 "$RT/run-llama-server.sh"

test -x "$RT/run-llama-server.sh" || { echo "ERROR: wrap not executable at $RT/run-llama-server.sh"; exit 1; }
test -x "$RT/bin/llama-server" || { echo "ERROR: llama-server not executable at $RT/bin/llama-server"; ls -la "$RT/bin"; exit 1; }
"$RT/run-llama-server.sh" --version | head -3 || echo "WARN: version probe failed"

# PF5: note9.json already ships ${HOME}/grz-runtime paths; legacy sed kept as no-op belt.
MAN="$HOME_GRZ/config/agents.note9.json"
if [[ -f $MAN ]]; then
  sed -i 's#/data/local/tmp/grz/models/Qwenstral-Small-3.1-0.5B.Q4_K_M.gguf#${HOME}/grz-runtime/models/Qwenstral-Small-3.1-0.5B.Q4_K_M.gguf#g' "$MAN" 2>/dev/null || true
fi

test -f "$HOME_GRZ/bin/green-roomz.mjs"
test -f "$MAN"

export GRZ_ROOT="$HOME_GRZ"
export LD_LIBRARY_PATH="$RT/lib:$RT/bin${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
cd "$HOME_GRZ"

echo "=== validate ==="
node ./bin/green-roomz.mjs validate --manifest ./config/agents.note9.json | tee "$HOME/grz-validate.json" | tee "$SD/validate.json"

# PF1/PF5: pidfile stop + wait ports (no pkill -f)
mkdir -p "$HOME_GRZ/data"
if [[ -f $HOME_GRZ/data/serve.pid ]]; then
  oldpid="$(tr -d ' \n\r\t' < "$HOME_GRZ/data/serve.pid" || true)"
  [[ -n "${oldpid:-}" ]] && kill -TERM "$oldpid" 2>/dev/null || true
fi
for _ in 1 2 3 4 5 6 7 8; do
  busy=0
  command -v ss >/dev/null 2>&1 && { ss -ltn 2>/dev/null | grep -q ':8080' && busy=1; ss -ltn 2>/dev/null | grep -q ':8187' && busy=1; }
  [[ $busy -eq 0 ]] && break
  sleep 1
done

echo "=== serve ==="
nohup node ./bin/green-roomz.mjs serve --manifest ./config/agents.note9.json --host 127.0.0.1 --port 8080 \
  >"$HOME/grz-serve.out.log" 2>"$HOME/grz-serve.err.log" &
echo "serve_pid=$!"
echo $! >"$HOME_GRZ/data/serve.pid"
echo $! >"$HOME/grz-serve.pid"
cp "$HOME/grz-serve.pid" "$SD/serve.pid" 2>/dev/null || true

ok=0
for i in $(seq 1 90); do
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
cp "$HOME/grz-serve.out.log" "$SD/serve.out.log" 2>/dev/null || true
cp "$HOME/grz-serve.err.log" "$SD/serve.err.log" 2>/dev/null || true
echo "=== DONE ok=$ok ==="
