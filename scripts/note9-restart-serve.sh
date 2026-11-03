#!/usr/bin/env bash
# Portable shebang (NewTermux may use a non-com.termux $PREFIX). Invoke as: bash <script>.sh
: "${LANG:=C.UTF-8}"; export LANG
# Restart serve only. To update sources use note9-refresh-src.sh (staged tarball,
# node --check); nothing is copied from /data/local/tmp here.
set -e
umask 077
# shellcheck source=note9-serve-pid.sh
. "$HOME/green-roomz/scripts/note9-serve-pid.sh"
grz_stop_serve
export LD_LIBRARY_PATH="$HOME/grz-runtime/lib:$HOME/grz-runtime/bin"
cd "$HOME/green-roomz"
nohup node ./bin/green-roomz.mjs serve --manifest ./config/agents.note9.json --host 127.0.0.1 --port 8080 \
  >"$HOME/grz-serve.out.log" 2>"$HOME/grz-serve.err.log" &
grz_write_pid "$!"
echo "serve_pid=$!"
sleep 10
node -e "fetch('http://127.0.0.1:8080/v1/models').then(async r=>console.log((await r.text()).slice(0,800)))"
echo RESTART_DONE
