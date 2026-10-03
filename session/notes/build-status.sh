#!/usr/bin/env bash
P=/workspace/code-bootstraps-llama.cpp
echo "$(date '+%a %b %-d  %-I:%M:%S %p PT')   load: $(cut -d' ' -f1-3 /proc/loadavg)"
echo
echo "Repo:      $( [ -d $P/.git ] && git -C $P log -1 --format='%h %s' 2>/dev/null || echo 'not cloned yet')"
echo "llama.cpp: $( [ -e $P/llama.cpp/.git ] && git -C $P/llama.cpp log -1 --format='%h %cd' --date=short 2>/dev/null || echo 'not checked out yet')"
for b in $P/build-*; do [ -d "$b" ] || continue
  n=$(ls "$b/bin" 2>/dev/null | wc -l)
  echo "$(basename $b): $(du -sh "$b" 2>/dev/null | cut -f1), $n binaries"
done
echo
echo "Compilers running: $(pgrep -c -f 'cc1plus|cc1 |clang' 2>/dev/null || echo 0)"
echo
df -h /workspace | tail -1 | awk '{print "Disk /workspace: "$3" used, "$4" free ("$5")"}'
