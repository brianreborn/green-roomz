#!/usr/bin/env bash
# Portable shebang. Invoke as: bash note9-run-llama-server.termux.sh [llama-server args]
# Under Termux: runs the verified $HOME/grz.current/runtime copy only. Refuses unless
#   - grz.current is a symlink to $HOME/grz.<sha> with no other symlinks inside,
#   - <sha> == .verified == sha256(manifest) == GRZ_MANIFEST_SHA256 (always required;
#     escape GRZ_ALLOW_UNVERIFIED_RUNTIME=1 skips only the env anchor),
#   - every bin/*.so and models/* file in runtime/ is listed in that manifest.
#   LD_LIBRARY_PATH is set to exactly "$RT/bin" (caller value discarded).
# adb-only legacy /data/local/tmp path: UNVERIFIED, requires GRZ_ADB_DEBUG=1.
set -eu
: "${LANG:=C.UTF-8}"; export LANG
die() { echo "ERROR: $*" >&2; exit 1; }
# Android 9 (API 28) minimum. getprop present: must print a number >= 28 (empty/non-numeric
# refuses). getprop missing: refuse on Android; skip on non-Android.
# N5: Android iff $TERMUX_VERSION is set or `uname -o` = Android ($PREFIX is not a signal).
is_android=0
if [ -n "${TERMUX_VERSION:-}" ] || [ "$(uname -o 2>/dev/null)" = Android ]; then is_android=1; fi
if command -v getprop >/dev/null 2>&1; then
  sdk=$(getprop ro.build.version.sdk 2>/dev/null | tr -d '[:space:]')
  case "$sdk" in
    ''|*[!0-9]*) die "getprop ro.build.version.sdk returned '$sdk' (empty/non-numeric); cannot confirm Android 9 (API 28) or later; refusing" ;;
    *) [ "$sdk" -ge 28 ] || die "Android SDK $sdk detected; this build needs Android 9 (API 28) or later" ;;
  esac
elif [ "$is_android" = 1 ]; then
  die "getprop not found but this is Android (TERMUX_VERSION set or uname -o = Android); cannot confirm Android 9 (API 28) or later; refusing"
fi
if [ "$is_android" = 1 ]; then
  # Release runner: no GRZ_RUNTIME_DIR/GRZ_TREE_DIR overrides. The only symlink allowed is
  # $HOME/grz.current; its realpath must be $HOME/grz.<64hex> and that hex must equal
  # .verified, sha256(manifest) and GRZ_MANIFEST_SHA256.
  if [ -n "${PREFIX:-}" ] && [ -x "$PREFIX/bin/realpath" ]; then REALPATH=$PREFIX/bin/realpath; else REALPATH=realpath; fi
  HOME_REAL=$("$REALPATH" -e -- "$HOME") || die "HOME missing"
  CUR=$HOME_REAL/grz.current
  [ -L "$CUR" ] || die "$CUR missing or not a symlink. Run note9-termux-setup.sh first; /data/local/tmp/grz/bin is adb-only (SELinux denies exec from Termux)."
  D=$("$REALPATH" -e -- "$CUR") || die "$CUR is dangling; refusing"
  hex=${D#"$HOME_REAL"/grz.}
  [[ $D == "$HOME_REAL"/grz.* && $hex =~ ^[0-9a-f]{64}$ ]] || die "$CUR resolves to $D, not $HOME_REAL/grz.<sha256>; refusing"
  # SD-21: shared prefix list (config/shared-storage-prefixes.txt) via the one helper.
  # shellcheck source=note9-shared-storage.sh
  . "$D/tree/scripts/note9-shared-storage.sh" || die "shared-storage helper missing in $D/tree; refusing"
  if grz_is_shared_storage "$D"; then die "$D is on shared storage; refusing"; fi
  if [ -n "${PREFIX:-}" ] && [ -x "$PREFIX/bin/find" ]; then FIND=$PREFIX/bin/find; else FIND="find"; fi
  # npm-deps: none: any node_modules dir in the installed tree is refused.
  nm=$("$FIND" "$D/tree" -name node_modules -print -quit 2>/dev/null)
  [ -z "$nm" ] || die "node_modules present in $D/tree ($nm); npm-deps: none; refusing"
  RT=$D/runtime
  MAN=$D/tree/config/note9-runtime.SHA256SUMS
  link=$("$FIND" "$D" -type l -print -quit 2>/dev/null)
  [ -z "$link" ] || die "symlink $link inside $D; refusing (only grz.current may be a symlink)"
  [ -x "$RT/bin/llama-server" ] || die "$RT/bin/llama-server missing or not executable"
  [ -f "$D/.verified" ] || die "$D/.verified missing; runtime not verified. Re-run note9-termux-setup.sh with GRZ_MANIFEST_SHA256."
  [ -f "$MAN" ] || die "manifest $MAN missing; refusing"
  stamp=$(tr -d '[:space:]' < "$D/.verified")
  cur=$(sha256sum < "$MAN" | cut -d' ' -f1)
  [ "$stamp" = "$cur" ] || die "$D/.verified ($stamp) does not match manifest sha256 ($cur); refusing"
  [ "$hex" = "$stamp" ] || die "folder $D does not match .verified ($stamp); refusing"
  # Anchor is always required: the stamp alone lives in a dir this user can write.
  if [ -z "${GRZ_MANIFEST_SHA256:-}" ]; then
    [ "${GRZ_ALLOW_UNVERIFIED_RUNTIME:-0}" = 1 ] || die "GRZ_MANIFEST_SHA256 unset; refusing (GRZ_ALLOW_UNVERIFIED_RUNTIME=1 only with Brian's per-host OK)"
    echo "!! WARNING: GRZ_ALLOW_UNVERIFIED_RUNTIME=1 — runner anchor check skipped" >&2
  elif [ "${GRZ_MANIFEST_SHA256,,}" != "$stamp" ]; then
    die "$D/.verified ($stamp) does not match GRZ_MANIFEST_SHA256; refusing"
  fi
  # SD-29: never start from a DRYRUN manifest or one without a models/ line.
  grep -q '^# DRYRUN' -- "$MAN" && die "manifest $MAN is a DRYRUN manifest; refusing to start"
  grep -qE '^[0-9a-f]{64} [ *]?\*?models/' -- "$MAN" || die "manifest $MAN has no models/ line; refusing to start"
  declare -A listed=()
  while read -r h p; do
    case "${h:-}" in ''|\#*) continue ;; esac
    listed[${p#\*}]=1
  done < "$MAN"
  shopt -s nullglob
  for f in "$RT"/bin/*.so "$RT"/bin/*.so.* "$RT"/models/*; do
    rel=${f#"$RT"/}
    [ -n "${listed[$rel]:-}" ] || die "$rel is not listed in $MAN; refusing to start"
  done
  # Native node addons (node_modules/**/*.node) must live in the hashed tree and be listed.
  while IFS= read -r -d '' f; do
    rel=tree/${f#"$D"/tree/}
    [ -n "${listed[$rel]:-}" ] || die "$rel (native addon) is not listed in $MAN; refusing to start"
  done < <("$FIND" "$D/tree" -name '*.node' -type f -print0 2>/dev/null)
  # Brian 2026-11-02: an API key is always required (loopback included). llama-server gets
  # --api-key-file (b11969 supports it); the key never appears in argv. Only a bare --version
  # probe (no server) runs without one.
  if [ "$#" -eq 1 ] && [ "$1" = --version ]; then
    export LD_LIBRARY_PATH="$RT/bin"; cd "$RT"; exec "$RT/bin/llama-server" --version
  fi
  for a in "$@"; do
    case "$a" in --api-key*) die "caller passed $a; the key comes only from api_key_file / GREEN_ROOMZ_API_KEY; refusing" ;; esac
  done
  STATE_DIR=$HOME_REAL/.green-roomz-state
  command -v node >/dev/null 2>&1 || die "node missing; cannot validate api_key_file; refusing"
  KEYF=$(GRZ_OVR_TREE="$D/tree" node --input-type=module -e '
    const { readHostOverride, hostOverridePath, readApiKeyFile } = await import(process.env.GRZ_OVR_TREE + "/src/config.mjs");
    try {
      const o = readHostOverride(hostOverridePath("agents.note9.json", process.env), process.env);
      if (o?.api_key_file) { readApiKeyFile(o.api_key_file, process.env); process.stdout.write(o.api_key_file); }
    } catch (e) { console.error("api_key_file: " + (e.details ? JSON.stringify(e.details) : e.message)); process.exit(1); }') \
    || die "api_key_file refused; refusing to start llama-server"
  if [ -z "$KEYF" ]; then
    key=${GREEN_ROOMZ_API_KEY:-}
    case "$key" in *[[:space:]]*) die "GREEN_ROOMZ_API_KEY contains whitespace/CR/LF; refusing" ;; esac
    [ -n "$key" ] || die "no API key (api_key_file in $STATE_DIR override, or GREEN_ROOMZ_API_KEY); phones always require one, loopback included; refusing"
    [ -d "$STATE_DIR" ] && [ ! -L "$STATE_DIR" ] || die "$STATE_DIR missing; run setup; refusing"
    KEYF=$STATE_DIR/llama-server.key
    [ -L "$KEYF" ] && die "$KEYF is a symlink; refusing"
    if ! { ( umask 077; printf '%s' "$key" > "$KEYF.tmp.$$" ) && chmod 600 "$KEYF.tmp.$$" && mv -f -- "$KEYF.tmp.$$" "$KEYF"; }; then
      die "writing $KEYF failed"
    fi
    unset key
  fi
  # The caller's env must not add/swap a key or flags: llama-server reads LLAMA_API_KEY,
  # LLAMA_ARG_API_KEY_FILE and every LLAMA_ARG_*.
  unset LLAMA_API_KEY LLAMA_ARG_API_KEY_FILE
  for v in $(compgen -e); do case "$v" in LLAMA_ARG_*) unset "$v" ;; esac; done
  export LD_LIBRARY_PATH="$RT/bin"
  cd "$RT"
  exec "$RT/bin/llama-server" "$@" --api-key-file "$KEYF"
fi
# adb-only path: unverified, debug only.
[ "${GRZ_ADB_DEBUG:-0}" = 1 ] || die "not under Termux; the adb /data/local/tmp runtime is UNVERIFIED. Set GRZ_ADB_DEBUG=1 to run it anyway (debug only)."
echo "!! WARNING: GRZ_ADB_DEBUG=1 — running UNVERIFIED runtime from writable /data/local/tmp/grz" >&2
export LD_LIBRARY_PATH="/data/local/tmp/grz/bin"
cd /data/local/tmp/grz
exec /data/local/tmp/grz/bin/llama-server "$@"
