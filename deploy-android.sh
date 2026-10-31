#!/usr/bin/env bash
# One-shot ADB drop of Android arm64 runtime + all pack models + Termux start snippet.
# No root. No su. No Knox/Magisk. Target /data/local/tmp/grz only.
# Keep android-arm64 tar for G3 Owner Termux only (G1 = isolation harness, not Termux-in-Private-Space).
# Linux aarch64 llama for G2 AVF Terminal: scripts/fetch-linux-aarch64.sh → runtime/linux-aarch64/
# (do not reuse this android tar inside the VM).
# Android pack excludes agents.windows.json / LocalAI paths (PF-M3 / pack recipe).
set -euo pipefail
export GRZ_ROOT="$(cd "$(dirname "$0")" && pwd)"
DEST=/data/local/tmp/grz
ANDROID_URL="https://github.com/ggml-org/llama.cpp/releases/download/b10702/llama-b10702-bin-android-arm64.tar.gz"
# Pin: sha256 of the official tarball. No default is baked in (not verified from this box);
# Pinned from GitHub release asset digest (ggml-org/llama.cpp b10702). Override with GRZ_ANDROID_SHA256 when bumping ANDROID_URL.
ANDROID_SHA256="${GRZ_ANDROID_SHA256:-afb8deb247271dd0b62301dbc7768a2d9eda2e2bb2966a57f81018c6e2aa3136}"

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
# Clear runtime + JS dirs by fixed literal path (no globs, no variables) so stale files never linger.
adb shell "rm -rf /data/local/tmp/grz/bin /data/local/tmp/grz/lib /data/local/tmp/grz/green-roomz" >/dev/null
adb shell "mkdir -p $DEST/bin $DEST/lib $DEST/models $DEST/green-roomz" >/dev/null

# Termux-aware temp base: TMPDIR, then $PREFIX/tmp (Termux), then /tmp.
tmp_base="${TMPDIR:-}"
if [[ -z "$tmp_base" && -n "${PREFIX:-}" && -d "$PREFIX/tmp" ]]; then tmp_base="$PREFIX/tmp"; fi
tmp_base="${tmp_base:-/tmp}"
umask 077
stage="$(mktemp -d "$tmp_base/grz.XXXXXX")"
cleanup() { rm -rf "$stage"; }
trap cleanup EXIT


# SHA256SUMS: host-side hashes of every runtime/JS file pushed, keyed by path relative to $DEST.
# termux-start.sh verifies these after copying into $HOME and before running anything.
sums="$stage/SHA256SUMS"
: >"$sums"
add_sums() { # add_sums <host dir> <dest-relative prefix>
  local dir="$1" prefix="$2"
  if [[ -n "$(find "$dir" -type l -print -quit)" ]]; then
    echo "ERROR: symlink under $dir; refusing to stage" >&2
    exit 1
  fi
  (cd "$dir" && find . -type f -print0 | LC_ALL=C sort -z | xargs -0 -r sha256sum) \
    | sed "s#  \./#  ${prefix}#" >>"$sums"
}
add_file_sum() { # add_file_sum <host file> <dest-relative path>
  [[ -L "$1" ]] && { echo "ERROR: symlink $1; refusing to stage" >&2; exit 1; }
  printf '%s  %s\n' "$(sha256sum <"$1" | cut -d' ' -f1)" "$2" >>"$sums"
}

if [[ -d "$GRZ_ROOT/runtime/android-arm64" ]]; then
  echo "pushing vendored runtime/android-arm64"
  add_sums "$GRZ_ROOT/runtime/android-arm64" ""
  adb push "$GRZ_ROOT/runtime/android-arm64/." "$DEST/"
else
  echo "fetching official android-arm64 tarball b10702 (not vendored; ~70MB)"
  if [[ ! "$ANDROID_SHA256" =~ ^[0-9a-f]{64}$ ]]; then
    echo "ERROR: GRZ_ANDROID_SHA256 unset/invalid; refusing unverified android-arm64 fetch (fail closed)" >&2
    exit 1
  fi
  curl -fL --retry 3 -o "$stage/android-arm64.tar.gz" "$ANDROID_URL"
  echo "$ANDROID_SHA256  $stage/android-arm64.tar.gz" | sha256sum -c --quiet - || {
    echo "ERROR: android-arm64 tarball sha256 mismatch" >&2
    exit 1
  }
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
  # umask 077 staged everything 0600/0700; Termux user must be able to read it.
  find "$stage/push" -type d -exec chmod 0755 {} +
  find "$stage/push" -type f -exec chmod 0644 {} +
  chmod 0755 "$stage/push/bin/llama-server"
  add_sums "$stage/push/bin" "bin/"
  add_sums "$stage/push/lib" "lib/"
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
add_sums "$GRZ_ROOT/bin" "green-roomz/bin/"
add_sums "$GRZ_ROOT/src" "green-roomz/src/"
add_sums "$GRZ_ROOT/policies" "green-roomz/policies/"
add_file_sum "$GRZ_ROOT/package.json" "green-roomz/package.json"
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
  add_file_sum "$cfg" "green-roomz/config/$base"
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
# docs are not hashed: termux-start.sh copies only SHA256SUMS-listed files (docs stay in the drop zone).
chmod 0644 "$sums"
adb push "$sums" "$DEST/SHA256SUMS"

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
# GOS-P7 slim torrent: prefer SLIM_TORRENT env, else newest green-roomz-beta-*-slim.torrent
REVIEWS_DIR="${REVIEWS_DIR:-/workspace/reviews}"
if [[ -z "${SLIM_TORRENT:-}" ]]; then
  # newest beta slim torrent (mtime); override with SLIM_TORRENT= for a pin
  SLIM_TORRENT=$(ls -1t "$REVIEWS_DIR"/green-roomz-beta-*-slim.torrent 2>/dev/null | head -1 || true)
fi
if [[ -n "${SLIM_TORRENT:-}" && -f "$SLIM_TORRENT" ]]; then
  slim_base=$(basename "$SLIM_TORRENT")
  slim_zip="${slim_base%.torrent}.zip"
  if [[ -n "${SLIM_INFOHASH:-}" ]]; then
    slim_ih="$SLIM_INFOHASH"
  elif command -v aria2c >/dev/null 2>&1; then
    slim_ih=$(aria2c -S "$SLIM_TORRENT" 2>/dev/null | awk -F': ' '/Info Hash:/ {print tolower($2); exit}')
  else
    slim_ih=""
  fi
  echo "GOS-P7: pushing slim .torrent + note (${slim_base}${slim_ih:+ infohash $slim_ih})"
  adb push "$SLIM_TORRENT" "$DEST/$slim_base"
  note="$stage/slim-torrent-note.txt"
  {
    echo "$slim_base"
    [[ -n "$slim_ih" ]] && echo "infohash $slim_ih"
    [[ -n "$slim_ih" ]] && echo "magnet:?xt=urn:btih:${slim_ih}&dn=${slim_zip}"
  } >"$note"
  chmod 0644 "$note"
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
