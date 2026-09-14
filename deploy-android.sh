#!/usr/bin/env bash
# One-shot ADB drop of Android arm64 runtime + all pack models + Termux start snippet.
# No root. No su. No Knox/Magisk. Target /data/local/tmp/grz only.
# Keep android-arm64 tar for G3 Owner Termux only (G1 = isolation harness, not Termux-in-Private-Space).
# Linux aarch64 llama for G2 AVF Terminal is MISSING
# (do not reuse this android tar inside the VM; no fake binary).
# Android pack excludes agents.windows.json / LocalAI paths (PF-M3 / pack recipe).
set -euo pipefail
export GRZ_ROOT="$(cd "$(dirname "$0")" && pwd)"
DEST=/data/local/tmp/grz
ANDROID_URL="https://github.com/ggml-org/llama.cpp/releases/download/b10702/llama-b10702-bin-android-arm64.tar.gz"

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

# PF-M3: push ALL models present under pack models/ (exclude nothing in that dir)
if [[ -d "$GRZ_ROOT/models" ]]; then
  shopt -s nullglob
  model_files=("$GRZ_ROOT/models"/*)
  shopt -u nullglob
  if ((${#model_files[@]} > 0)); then
    echo "pushing ${#model_files[@]} file(s) from models/ (all present)"
    adb push "$GRZ_ROOT/models/." "$DEST/models/"
  else
    echo "WARN: models/ empty (slim pack); push models separately into $DEST/models/"
  fi
else
  echo "WARN: no models/ directory; push models separately into $DEST/models/"
fi

# JS tree without linux runtime (Termux copies into $HOME)
# Exclude agents.windows.json (LocalAI overlay) from Android drop
echo "pushing JS tree + Termux snippet"
adb push "$GRZ_ROOT/bin" "$DEST/green-roomz/bin"
adb push "$GRZ_ROOT/src" "$DEST/green-roomz/src"
adb shell "mkdir -p $DEST/green-roomz/config" >/dev/null
shopt -s nullglob
for cfg in "$GRZ_ROOT/config"/*; do
  [[ -f $cfg ]] || continue
  base="$(basename "$cfg")"
  if [[ "$base" == "agents.windows.json" ]]; then
    echo "skip $base (not for Android pack)"
    continue
  fi
  adb push "$cfg" "$DEST/green-roomz/config/"
done
shopt -u nullglob
adb push "$GRZ_ROOT/policies" "$DEST/green-roomz/policies"
adb push "$GRZ_ROOT/package.json" "$DEST/green-roomz/package.json"
adb push "$GRZ_ROOT/termux-start.sh" "$DEST/termux-start.sh"
if [[ -f "$GRZ_ROOT/scripts/note9-termux-setup.sh" ]]; then
  adb push "$GRZ_ROOT/scripts/note9-termux-setup.sh" "$DEST/setup.sh"
fi
adb push "$GRZ_ROOT/docs" "$DEST/green-roomz/docs" 2>/dev/null || true

# GOS-P7: push models lockfile (+ optional slim torrent note) beside models for Termux verify
REVIEWS_DIR="${GRZ_REVIEWS:-}"
if [[ -z "$REVIEWS_DIR" ]]; then
  for cand in "$GRZ_ROOT/../reviews" "/workspace/reviews"; do
    if [[ -f "$cand/green-roomz-models.lock.json" ]]; then
      REVIEWS_DIR="$(cd "$cand" && pwd)"
      break
    fi
  done
fi
if [[ -n "${REVIEWS_DIR:-}" && -f "$REVIEWS_DIR/green-roomz-models.lock.json" ]]; then
  echo "GOS-P7: pushing green-roomz-models.lock.json → $DEST/"
  adb push "$REVIEWS_DIR/green-roomz-models.lock.json" "$DEST/green-roomz-models.lock.json"
else
  echo "WARN: GOS-P7 lockfile not found (set GRZ_REVIEWS or place reviews/green-roomz-models.lock.json)"
fi
SLIM_TORRENT="${REVIEWS_DIR:-/workspace/reviews}/green-roomz-beta-0.5.2-slim.torrent"
if [[ -f "$SLIM_TORRENT" ]]; then
  echo "GOS-P7: pushing slim .torrent + note (infohash 74f859266f933588fdd32dffd9272f41f9ad6c7c)"
  adb push "$SLIM_TORRENT" "$DEST/green-roomz-beta-0.5.2-slim.torrent"
  note="$stage/slim-torrent-note.txt"
  printf '%s\n' \
    "green-roomz-beta-0.5.2-slim.torrent" \
    "infohash 74f859266f933588fdd32dffd9272f41f9ad6c7c" \
    "magnet:?xt=urn:btih:74f859266f933588fdd32dffd9272f41f9ad6c7c&dn=green-roomz-beta-0.5.2-slim.zip" \
    >"$note"
  adb push "$note" "$DEST/slim-torrent-note.txt"
fi
# 644 so Termux bash can *read* the snippet; SELinux blocks execute-from-tmp
adb shell "chmod 644 $DEST/termux-start.sh $DEST/setup.sh $DEST/green-roomz/package.json" >/dev/null || true

cat <<EOF
pushed to $DEST
On the phone, in Termux (no root):
  bash /data/local/tmp/grz/termux-start.sh
Host forward:
  adb forward tcp:18080 tcp:8080
EOF
