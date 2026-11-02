#!/data/data/com.termux/files/usr/bin/bash
set -e
ST=/data/local/tmp/grz
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
cp "$PROP" "$ST/termux.properties.copy" 2>/dev/null || true
if command -v termux-reload-settings >/dev/null 2>&1; then
  termux-reload-settings || true
fi
echo DONE | tee -a "$ST/ext-apps.status"
