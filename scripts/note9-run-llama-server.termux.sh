#!/usr/bin/env bash
# PF-M8: refuse empty HOME (would exec /grz-runtime/...)
if [[ -z "${HOME:-}" ]]; then echo "ERROR: HOME empty/unset (PF-M8 fail-closed)" >&2; exit 1; fi
# PF5: exec from $HOME/grz-runtime only — never /data/local/tmp (no exec/mmap from drop zone).
export LD_LIBRARY_PATH="${HOME}/grz-runtime/lib:${HOME}/grz-runtime/bin:${LD_LIBRARY_PATH:-}"
cd "${HOME}/grz-runtime"
exec "${HOME}/grz-runtime/bin/llama-server" "$@"
