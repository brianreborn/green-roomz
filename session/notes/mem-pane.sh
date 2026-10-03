#!/bin/bash
export TERM="${TERM:-xterm-256color}"
while true; do
  cols=$(tput cols 2>/dev/null || echo 40)
  lines=$(tput lines 2>/dev/null || echo 6)
  printf '\033[H\033[J'
  echo "MEM  $(TZ=America/Los_Angeles date '+%H:%M:%S PT')"
  eval $(awk '/MemTotal/{t=$2} /MemAvailable/{a=$2} END{u=t-a; printf "t=%s a=%s u=%s", t,a,u}' /proc/meminfo)
  # percentages
  pct=$((100 * u / t))
  barw=$((cols - 12))
  [ "$barw" -lt 8 ] && barw=8
  filled=$((pct * barw / 100))
  [ "$filled" -gt "$barw" ] && filled=$barw
  bar=$(printf '%*s' "$filled" '' | tr ' ' '#')
  pad=$(printf '%*s' $((barw - filled)) '')
  awk -v u="$u" -v t="$t" -v a="$a" 'BEGIN{printf " %4.1f / %.1fG  avail %.1fG  %d%%\n", u/1024/1024, t/1024/1024, a/1024/1024, 100*u/t}'
  echo " ${bar}${pad}"
  # swap, one line if there is height
  if [ "$lines" -ge 4 ]; then
    awk '/SwapTotal/{st=$2} /SwapFree/{sf=$2} END{if(st+0>0) printf " swap %.1f / %.1fG\n", (st-sf)/1024/1024, st/1024/1024; else print " swap none"}' /proc/meminfo
  fi
  sleep 1
done
