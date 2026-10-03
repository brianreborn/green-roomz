#!/bin/bash
# Write the current live prompt or response for the watch console.
#   live-io.sh prompt "text..."
#   live-io.sh response "text..."          # replace
#   live-io.sh response-append "chunk"     # stream
set -e
kind=${1:-}
shift || true
file_prompt=/workspace/session/prompt.log
file_response=/workspace/session/response.log
ts=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
text=${*:-}
case "$kind" in
  prompt)
    printf '[%s]\n%s\n' "$ts" "$text" > "$file_prompt"
    ;;
  response)
    printf '[%s]\n%s\n' "$ts" "$text" > "$file_response"
    ;;
  response-append)
    printf '%s' "$text" >> "$file_response"
    ;;
  *)
    echo "usage: $0 prompt|response|response-append TEXT" >&2
    exit 2
    ;;
esac
