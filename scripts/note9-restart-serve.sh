#!/usr/bin/env bash
# Portable shebang (NewTermux may use a non-com.termux $PREFIX). Invoke as: bash <script>.sh
: "${LANG:=C.UTF-8}"; export LANG
set -e
cp /data/local/tmp/grz/green-roomz/src/memory.mjs "$HOME/green-roomz/src/memory.mjs"
if [[ -f $HOME/grz-serve.pid ]]; then
  kill "$(cat "$HOME/grz-serve.pid")" 2>/dev/null || true
fi
sleep 1
export LD_LIBRARY_PATH="$HOME/grz-runtime/lib:$HOME/grz-runtime/bin"
cd "$HOME/green-roomz"
nohup node ./bin/green-roomz.mjs serve --manifest ./config/agents.note9.json --host 127.0.0.1 --port 8080 \
  >"$HOME/grz-serve.out.log" 2>"$HOME/grz-serve.err.log" &
echo $! | tee "$HOME/grz-serve.pid" /sdcard/Download/grz/serve.pid
sleep 10
node -e "fetch('http://127.0.0.1:8080/v1/models').then(async r=>console.log((await r.text()).slice(0,800)))"
echo RESTART_DONE
