#!/data/data/com.termux/files/usr/bin/bash
# Termux-side start. adb drop zone is /data/local/tmp/grz (shell can write; Termux cannot exec there).
# Copy runtime into $HOME then serve. No root. Do not su. Do not trip Knox.
set -uo pipefail
# PF-M8: empty/unset HOME must not collapse paths to /grz-runtime
if [[ -z "${HOME:-}" ]]; then
  echo "ERROR: HOME is empty/unset; refusing /grz-runtime collapse (PF-M8 fail-closed)" >&2
  exit 1
fi
SD=/sdcard/Download/grz
SRC=/data/local/tmp/grz
LOG=$HOME/grz-setup.log
mkdir -p "$SD" "$HOME"
exec > >(tee -a "$LOG" | tee -a "$SD/setup.log") 2>&1
echo "=== termux-start $(date -Is 2>/dev/null || date) ==="
echo "uid=$(id) HOME=$HOME"

if ! command -v node >/dev/null 2>&1; then
  pkg update -y || true
  pkg install -y nodejs
fi
command -v node >/dev/null || { echo "ERROR: nodejs missing"; exit 1; }

HOME_GRZ="$HOME/green-roomz"
RT="$HOME/grz-runtime"
mkdir -p "$HOME_GRZ" "$RT/bin" "$RT/lib" "$RT/models" "$RT/missing"

if [[ -d $SRC/green-roomz ]]; then
  cp -a "$SRC/green-roomz/." "$HOME_GRZ/"
elif [[ -d $SD/green-roomz ]]; then
  cp -a "$SD/green-roomz/." "$HOME_GRZ/"
else
  echo "WARN: no JS tree at $SRC/green-roomz — copy the unzipped pack into \$HOME/green-roomz"
fi

# android tarball is often flat (llama-server + .so) or bin/+lib/
for src in "$SRC/bin" "$SRC"; do
  [[ -d $src ]] || continue
  cp -a "$src/llama-server" "$RT/bin/" 2>/dev/null || true
  cp -a "$src/"*.so "$RT/bin/" 2>/dev/null || true
done
cp -a "$SRC/lib/"*.so "$RT/lib/" 2>/dev/null || true
# PF-M3: copy ALL staged models (not nexus-only)
echo "=== copy models into \$HOME/grz-runtime/models (all files present) ==="
copied=0
for src_models in "$SRC/models" "$SD/models"; do
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
chmod 755 "$RT/bin/llama-server" 2>/dev/null || true

cat > "$RT/run-llama-server.sh" <<'WRAP'
#!/usr/bin/env bash
export LD_LIBRARY_PATH="${HOME}/grz-runtime/lib:${HOME}/grz-runtime/bin:${LD_LIBRARY_PATH:-}"
cd "${HOME}/grz-runtime"
exec "${HOME}/grz-runtime/bin/llama-server" "$@"
WRAP
chmod 755 "$RT/run-llama-server.sh"

MAN="$HOME_GRZ/config/agents.note9.json"
[[ -f $MAN ]] || MAN="$HOME_GRZ/config/agents.android.json"
test -f "$HOME_GRZ/bin/green-roomz.mjs"
test -f "$MAN"
test -x "$RT/run-llama-server.sh" || { echo "ERROR: wrap missing"; exit 1; }
test -x "$RT/bin/llama-server" || { echo "ERROR: llama-server not executable at $RT/bin/llama-server"; ls -la "$RT/bin"; exit 1; }

export GRZ_ROOT="$HOME_GRZ"
export GRZ_EXE="${GRZ_EXE-}"
export LD_LIBRARY_PATH="$RT/lib:$RT/bin${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
cd "$HOME_GRZ"
mkdir -p "$HOME_GRZ/data"

# PF1/PF5: stop via pidfile + wait ports; do not pkill -f
if [[ -f $HOME_GRZ/data/serve.pid ]]; then
  oldpid="$(tr -d ' \n\r\t' < "$HOME_GRZ/data/serve.pid" || true)"
  if [[ -n "${oldpid:-}" ]]; then kill -TERM "$oldpid" 2>/dev/null || true; fi
fi
if [[ -f $HOME/grz-serve.pid ]]; then
  oldpid="$(tr -d ' \n\r\t' < "$HOME/grz-serve.pid" || true)"
  if [[ -n "${oldpid:-}" ]]; then kill -TERM "$oldpid" 2>/dev/null || true; fi
fi
# Wait 8080/8187 down before relaunch
for _ in 1 2 3 4 5 6 7 8 9 10; do
  busy=0
  if command -v ss >/dev/null 2>&1; then
    ss -ltn 2>/dev/null | grep -q ':8080' && busy=1
    ss -ltn 2>/dev/null | grep -q ':8187' && busy=1
  fi
  [[ $busy -eq 0 ]] && break
  sleep 1
done

nohup node ./bin/green-roomz.mjs serve --manifest "$MAN" --host 127.0.0.1 --port 8080 \
  >"$HOME/grz-serve.out.log" 2>"$HOME/grz-serve.err.log" &
echo "serve_pid=$!"
echo $! >"$HOME/grz-serve.pid"
echo $! >"$HOME_GRZ/data/serve.pid"
echo "gateway http://127.0.0.1:8080  (host: adb forward tcp:18080 tcp:8080)"
