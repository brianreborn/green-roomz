#!/usr/bin/env bash
# fetch-linux-aarch64.sh — G2 / AVF Terminal (Debian linux guest) llama runtime.
# Fetches official ggml-org ubuntu-arm64 b10702 into runtime/linux-aarch64/.
# runtime/ is gitignored (same as flat x86_64 llama-server); packs/scripts fetch on demand.
# Hard: do not reuse android-arm64; never GGUF on 8600; pin b10702 with Win/Android.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/runtime/linux-aarch64"
PIN="${GRZ_LLAMA_PIN:-b10702}"
URL="${GRZ_LINUX_AARCH64_URL:-https://github.com/ggml-org/llama.cpp/releases/download/${PIN}/llama-${PIN}-bin-ubuntu-arm64.tar.gz}"

mkdir -p "$OUT"
stage="$(mktemp -d /tmp/grz-linux-aarch64.XXXXXX)"
cleanup() { rm -rf "$stage"; }
trap cleanup EXIT

echo "fetching $URL → $OUT"
curl -fL --retry 3 -o "$stage/ubuntu-arm64.tar.gz" "$URL"
mkdir -p "$stage/extract"
tar -xzf "$stage/ubuntu-arm64.tar.gz" -C "$stage/extract"
srv="$(find "$stage/extract" -type f -name 'llama-server' | head -1 || true)"
if [[ -z "$srv" ]]; then
  echo "ERROR: llama-server not in ubuntu-arm64 tarball" >&2
  exit 1
fi
d="$(dirname "$srv")"
# Flatten llama-server + companion .so (and versioned symlinks) into OUT
cp -a "$srv" "$OUT/"
find "$d" -maxdepth 1 \( -type f -o -type l \) \( -name '*.so' -o -name '*.so.*' \) \
  -exec cp -a {} "$OUT/" \;
chmod +x "$OUT/llama-server"

# Verify glibc aarch64 interpreter (refuse Android linker)
interp=""
if command -v readelf >/dev/null 2>&1; then
  interp="$(readelf -l "$OUT/llama-server" 2>/dev/null | awk -F: '/interpreter/{gsub(/[\[\] ]/,"",$2); print $2; exit}')"
fi
case "$interp" in
  *ld-linux-aarch64*)
    echo "OK interpreter=$interp (glibc aarch64)"
    ;;
  *linker64*|*system/bin*)
    echo "ERROR: Android linker ($interp) — wrong artifact for G2; refuse" >&2
    rm -f "$OUT/llama-server"
    exit 1
    ;;
  "")
    echo "WARN: could not read interpreter (no readelf); trusting official pin $PIN"
    ;;
  *)
    echo "WARN: unexpected interpreter=$interp (expected ld-linux-aarch64.so.1)"
    ;;
esac

echo "populated $OUT ($(du -sh "$OUT" | awk '{print $1}'))"
echo "next: on aarch64 Linux guest, ./start.sh prefers this over flat runtime/llama-server"
