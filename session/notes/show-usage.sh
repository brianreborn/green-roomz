#!/bin/bash
# Cheap local usage pane. No model calls.
if [ -f "$HOME/.grok/auth.json" ]; then
  /workspace/session/fetch-usage.sh >/dev/null 2>&1 || true
fi
echo "USAGE  $(TZ=America/Los_Angeles date '+%I:%M:%S %p PT')"
echo "refresh every 2 min · no AI"
echo
if [ -f /workspace/session/usage-latest.txt ]; then
  cat /workspace/session/usage-latest.txt
else
  echo "Waiting on grok login for SuperGrok weekly pool."
fi
echo
echo "load $(cut -d' ' -f1-3 /proc/loadavg)  mem $(awk '/MemAvailable/{a=$2} /MemTotal/{t=$2} END{printf \"%d/%d MiB free\", a/1024, t/1024}' /proc/meminfo)"
