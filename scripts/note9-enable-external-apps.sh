#!/usr/bin/env bash
# Portable shebang (NewTermux may use a non-com.termux $PREFIX). Invoke as: bash <script>.sh
set -e
umask 077
# Status goes to the user-state folder (700), never /data/local/tmp or /sdcard.
ST="$HOME/.green-roomz-state"
[[ -L $ST ]] && { echo "ERROR: $ST is a symlink; refusing" >&2; exit 1; }
mkdir -p "$ST" && chmod 700 "$ST"
mkdir -p "$HOME/.termux"
PROP="$HOME/.termux/termux.properties"
touch "$PROP"
if grep -q '^allow-external-apps=true' "$PROP" 2>/dev/null; then
  echo "already_enabled" | tee "$ST/ext-apps.status"
else
  grep -v '^allow-external-apps=' "$PROP" > "$PROP.tmp" 2>/dev/null || true
  mv "$PROP.tmp" "$PROP"
  echo 'allow-external-apps=true' >> "$PROP"
  echo "enabled" | tee "$ST/ext-apps.status"
fi
if command -v termux-reload-settings >/dev/null 2>&1; then
  termux-reload-settings || true
fi
echo DONE | tee -a "$ST/ext-apps.status"
