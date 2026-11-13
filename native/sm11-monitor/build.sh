#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd "$(dirname "$0")" && pwd)
CUDA_HOME=${CUDA_HOME:-${CUDA_PATH:-}}
NVCC=${NVCC:-}

if [ -z "$NVCC" ]; then
  if [ -n "$CUDA_HOME" ]; then
    NVCC="$CUDA_HOME/bin/nvcc"
  else
    NVCC=nvcc
  fi
fi

if ! command -v "$NVCC" >/dev/null 2>&1; then
  echo "missing nvcc; set NVCC or CUDA_HOME to a CUDA toolkit with sm_11 support" >&2
  exit 1
fi

set --
if [ -n "${CCBIN:-}" ]; then
  set -- --compiler-bindir "$CCBIN"
fi

mkdir -p "$SCRIPT_DIR/out"
"$NVCC" "$@" -O2 -arch=sm_11 \
  -o "$SCRIPT_DIR/out/sm11_monitor" \
  "$SCRIPT_DIR/sm11_monitor.cu"

echo "built $SCRIPT_DIR/out/sm11_monitor"
