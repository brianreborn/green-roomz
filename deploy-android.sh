#!/usr/bin/env bash
# One-shot ADB drop of Android arm64 runtime + 0.5B GGUF + Termux start snippet.
# No root. No su. No Knox/Magisk. Target /data/local/tmp/grz only.
set -euo pipefail
export GRZ_ROOT="$(cd "$(dirname "$0")" && pwd)"
DEST=/data/local/tmp/grz
ANDROID_URL="https://github.com/ggml-org/llama.cpp/releases/download/b10702/llama-b10702-bin-android-arm64.tar.gz"
MODEL_NAME="Qwenstral-Small-3.1-0.5B.Q4_K_M.gguf"

if ! command -v adb >/dev/null 2>&1; then
  echo "no device"
  exit 0
fi
state="$(adb get-state 2>/dev/null || true)"
if [[ "$state" != "device" ]]; then
  echo "no device"
  exit 0
fi

echo "adb device: $(adb get-serialno 2>/dev/null || echo unknown)"
adb shell "mkdir -p $DEST/bin $DEST/lib $DEST/models $DEST/green-roomz" >/dev/null

stage="$(mktemp -d /tmp/grz-android.XXXXXX)"
cleanup() { rm -rf "$stage"; }
trap cleanup EXIT

if [[ -d "$GRZ_ROOT/runtime/android-arm64" ]]; then
  echo "pushing vendored runtime/android-arm64"
  adb push "$GRZ_ROOT/runtime/android-arm64/." "$DEST/"
else
  echo "fetching official android-arm64 tarball b10702 (not vendored; ~70MB)"
  curl -fL --retry 3 -o "$stage/android-arm64.tar.gz" "$ANDROID_URL"
  mkdir -p "$stage/extract"
  tar -xzf "$stage/android-arm64.tar.gz" -C "$stage/extract"
  # flatten: find llama-server and .so
  srv="$(find "$stage/extract" -type f -name 'llama-server' | head -1 || true)"
  if [[ -z "$srv" ]]; then
    echo "ERROR: llama-server not in android tarball" >&2
    exit 1
  fi
  mkdir -p "$stage/push/bin" "$stage/push/lib"
  cp -a "$srv" "$stage/push/bin/"
  find "$stage/extract" -type f -name '*.so' -exec cp -a {} "$stage/push/lib/" \;
  # some builds colocate .so next to the binary
  d="$(dirname "$srv")"
  find "$d" -maxdepth 1 -type f -name '*.so' -exec cp -a {} "$stage/push/bin/" \;
  adb push "$stage/push/bin/." "$DEST/bin/"
  adb push "$stage/push/lib/." "$DEST/lib/"
fi

if [[ -f "$GRZ_ROOT/models/$MODEL_NAME" ]]; then
  echo "pushing $MODEL_NAME"
  adb push "$GRZ_ROOT/models/$MODEL_NAME" "$DEST/models/"
else
  echo "WARN: $MODEL_NAME not in this unzip (slim pack); push it separately"
fi

# JS tree without linux runtime / models (Termux copies into $HOME)
echo "pushing JS tree + Termux snippet"
adb push "$GRZ_ROOT/bin" "$DEST/green-roomz/bin"
adb push "$GRZ_ROOT/src" "$DEST/green-roomz/src"
adb push "$GRZ_ROOT/config" "$DEST/green-roomz/config"
adb push "$GRZ_ROOT/policies" "$DEST/green-roomz/policies"
adb push "$GRZ_ROOT/package.json" "$DEST/green-roomz/package.json"
adb push "$GRZ_ROOT/termux-start.sh" "$DEST/termux-start.sh"
adb push "$GRZ_ROOT/docs" "$DEST/green-roomz/docs" 2>/dev/null || true
# 644 so Termux bash can *read* the snippet; SELinux blocks execute-from-tmp
adb shell "chmod 644 $DEST/termux-start.sh $DEST/green-roomz/package.json" >/dev/null || true

cat <<EOF
pushed to $DEST
On the phone, in Termux (no root):
  bash /data/local/tmp/grz/termux-start.sh
Host forward:
  adb forward tcp:18080 tcp:8080
EOF
