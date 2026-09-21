#!/data/data/com.termux/files/usr/bin/bash
# Copy a staged src/bin/web/policies tree into ~/green-roomz and restart serve.
# Run from Termux: bash /data/local/tmp/grz/note9-refresh-src.sh
set -eu
ST=/data/local/tmp/grz
HOME_GRZ="$HOME/green-roomz"
STAGE="$HOME/grz-src-stage"
LOG="$HOME/grz-refresh.log"
MARK=/sdcard/Download/grz/refresh.status
mkdir -p /sdcard/Download/grz 2>/dev/null || true
exec >"$LOG" 2>&1
echo START "$(date)" | tee "$MARK"
test -d "$HOME_GRZ"
test -f "$HOME_GRZ/config/agents.note9.json"
rm -rf "$STAGE"
mkdir -p "$STAGE"
tar -xzf "$ST/grz-src.tgz" -C "$STAGE"
node --check "$STAGE/bin/green-roomz.mjs"
node --check "$STAGE/src/gateway.mjs"
mkdir -p "$HOME_GRZ/web"
cp -a "$STAGE/src/." "$HOME_GRZ/src/"
cp -a "$STAGE/bin/." "$HOME_GRZ/bin/"
cp -a "$STAGE/web/." "$HOME_GRZ/web/"
cp -a "$STAGE/policies/." "$HOME_GRZ/policies/"
pids=""
for d in /proc/[0-9]*; do
  cmd=$(tr '\0' ' ' < "$d/cmdline" 2>/dev/null || true)
  case "$cmd" in
    *bin/green-roomz.mjs*serve*) pids="$pids ${d#/proc/}" ;;
  esac
done
echo STOP="$pids"
if [ -n "$pids" ]; then
  kill $pids || true
  sleep 2
  kill -9 $pids 2>/dev/null || true
fi
export LD_LIBRARY_PATH="$HOME/grz-runtime/lib:$HOME/grz-runtime/bin${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
cd "$HOME_GRZ"
nohup node ./bin/green-roomz.mjs serve --manifest ./config/agents.note9.json --host 127.0.0.1 --port 8080 \
  >"$HOME/grz-serve.out.log" 2>"$HOME/grz-serve.err.log" &
echo $! | tee "$HOME/grz-serve.pid"
sleep 8
node -e "fetch('http://127.0.0.1:8080/').then(async r=>console.log('ROOT', r.status, (await r.text()).slice(0,80))).catch(e=>console.log('FETCH_FAIL', e.message))"
echo REFRESH_DONE | tee -a "$MARK"
