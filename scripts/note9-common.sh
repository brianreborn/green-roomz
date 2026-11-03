#!/usr/bin/env bash
# Sourced helper for note9 setup / refresh / restart. Layout (see note9-verify-runtime.sh):
#   $HOME/grz.current -> grz.<sha>/{runtime,tree,.verified}; user state in $HOME/.green-roomz-state.
# Nothing here stores a runtime path: every caller resolves through grz.current.
if [[ -n ${PREFIX:-} && -x ${PREFIX}/bin/realpath ]]; then REALPATH=$PREFIX/bin/realpath; else REALPATH="realpath"; fi
GRZ_CUR="$HOME/grz.current"
GRZ_STATE="$HOME/.green-roomz-state"

# shellcheck source=note9-shared-storage.sh
. "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/note9-shared-storage.sh"

# N5: Android host iff $TERMUX_VERSION is set or `uname -o` says Android ($PREFIX is not a signal).
grz_is_android() { [[ -n ${TERMUX_VERSION:-} || $(uname -o 2>/dev/null) == Android ]]; }

# Android 9 (API 28) minimum. getprop present: must print a number >= 28. getprop missing:
# refuse on an Android host (grz_is_android); skip only on non-Android hosts.
grz_sdk_check() {
  local sdk
  if command -v getprop >/dev/null 2>&1; then
    sdk=$(getprop ro.build.version.sdk 2>/dev/null | tr -d '[:space:]')
    [[ $sdk =~ ^[0-9]+$ ]] || { echo "ERROR: getprop ro.build.version.sdk returned '${sdk}' (empty/non-numeric); cannot confirm Android 9 (API 28) or later; refusing" >&2; return 1; }
    (( sdk >= 28 )) || { echo "ERROR: Android SDK $sdk detected; this build needs Android 9 (API 28) or later" >&2; return 1; }
  elif grz_is_android; then
    echo "ERROR: getprop not found but this is Android (TERMUX_VERSION set or uname -o = Android); cannot confirm Android 9 (API 28) or later; refusing" >&2; return 1
  fi
  return 0
}

grz_state_init() {
  [[ -L $GRZ_STATE ]] && { echo "ERROR: $GRZ_STATE is a symlink; refusing" >&2; return 1; }
  mkdir -p "$GRZ_STATE" && chmod 700 "$GRZ_STATE"
}

# Resolve grz.current -> GRZ_DIR (realpath), GRZ_TREE, GRZ_RT. Fails if not a symlink to grz.<64hex>.
grz_resolve_current() {
  local home_real hex
  home_real=$("$REALPATH" -e -- "$HOME") || return 1
  [[ -L $GRZ_CUR ]] || { echo "ERROR: $GRZ_CUR missing or not a symlink; run note9-termux-setup.sh" >&2; return 1; }
  GRZ_DIR=$("$REALPATH" -e -- "$GRZ_CUR") || { echo "ERROR: $GRZ_CUR dangling" >&2; return 1; }
  hex=${GRZ_DIR#"$home_real"/grz.}
  [[ $GRZ_DIR == "$home_real"/grz.* && $hex =~ ^[0-9a-f]{64}$ ]] || { echo "ERROR: $GRZ_CUR -> $GRZ_DIR is not grz.<sha256>" >&2; return 1; }
  GRZ_TREE=$GRZ_DIR/tree; export GRZ_RT=$GRZ_DIR/runtime
}

# 1 if the validated host override says log_opt_in=true, else 0. Loader rules apply
# (allowlist, 600, owner, no symlink); a refused override counts as an error.
grz_log_opt_in() {
  local tree=${1:?tree}
  GRZ_OVR_TREE=$tree node --input-type=module -e '
    const { readHostOverride, hostOverridePath } = await import(process.env.GRZ_OVR_TREE + "/src/config.mjs");
    const o = readHostOverride(hostOverridePath("agents.note9.json", process.env), process.env);
    process.stdout.write(o?.log_opt_in === true ? "1" : "0");'
}

# Log destination: off by default (/dev/null); on opt-in, $GRZ_STATE/logs/<name>.log, mode 600.
grz_log_path() { # name optin
  if [[ $2 == 1 ]]; then
    mkdir -p "$GRZ_STATE/logs" && chmod 700 "$GRZ_STATE/logs"
    ( umask 077; : >> "$GRZ_STATE/logs/$1.log" ); chmod 600 "$GRZ_STATE/logs/$1.log"
    printf '%s\n' "$GRZ_STATE/logs/$1.log"
  else
    printf '/dev/null\n'
  fi
}

# Start serve from the resolved tree; writes pidfile. Args: port optin
grz_serve_start() {
  local port=$1 optin=$2 out err
  out=$(grz_log_path serve.out "$optin"); err=$(grz_log_path serve.err "$optin")
  ( cd "$GRZ_TREE" && unset LD_LIBRARY_PATH && GRZ_ROOT="$GRZ_TREE" exec nohup node ./bin/green-roomz.mjs serve \
      --manifest ./config/agents.note9.json --host 127.0.0.1 --port "$port" >>"$out" 2>>"$err" ) &
  GRZ_SERVE_PID=$!
  grz_write_pid "$GRZ_SERVE_PID"
}

# Brian 2026-11-02: phones ALWAYS require an API key, loopback included.
# grz_key_generate <file>: 0600 random key (64 hex) if <file> does not exist yet.
grz_key_generate() {
  local f=$1 tmp
  [[ -e $f || -L $f ]] && return 0
  tmp=$f.tmp.$$
  ( umask 077; head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n' > "$tmp" ) || return 1
  chmod 600 "$tmp" && mv -f -- "$tmp" "$f"
}
# grz_key_check <tree>: prints the validated key file path (override api_key_file, read via one
# O_NOFOLLOW fd), or "env" when only GREEN_ROOMZ_API_KEY is set. Fails when neither is valid.
grz_key_check() {
  GRZ_OVR_TREE=${1:?tree} node --input-type=module -e '
    const { readHostOverride, hostOverridePath, readApiKeyFile } = await import(process.env.GRZ_OVR_TREE + "/src/config.mjs");
    try {
      const o = readHostOverride(hostOverridePath("agents.note9.json", process.env), process.env);
      if (o?.api_key_file) { readApiKeyFile(o.api_key_file, process.env); process.stdout.write(o.api_key_file); process.exit(0); }
    } catch (e) { console.error("ERROR: api key: " + (e.details ? JSON.stringify(e.details) : e.message)); process.exit(1); }
    if ((process.env.GREEN_ROOMZ_API_KEY ?? "").trim()) { process.stdout.write("env"); process.exit(0); }
    console.error("ERROR: no API key: set api_key_file in the host override (setup generates one) or GREEN_ROOMZ_API_KEY; phones always require a key, loopback included; refusing");
    process.exit(1);'
}
# grz_probe <url> <keysrc> [print]: GET with Authorization: Bearer (key read inside node).
grz_probe() {
  GRZ_PROBE_URL=$1 GRZ_PROBE_KEY=$2 GRZ_PROBE_PRINT=${3:-0} node -e '
    const k = process.env.GRZ_PROBE_KEY === "env" ? process.env.GREEN_ROOMZ_API_KEY.trim() : require("fs").readFileSync(process.env.GRZ_PROBE_KEY, "utf8").trim();
    fetch(process.env.GRZ_PROBE_URL, { headers: { authorization: "Bearer " + k } })
      .then(async (r) => { if (process.env.GRZ_PROBE_PRINT === "1") console.log((await r.text()).slice(0, 800)); process.exit(r.ok ? 0 : 1); })
      .catch(() => process.exit(1));'
}

# Port from the validated override, else 8080.
grz_port() {
  GRZ_OVR_TREE=${1:?tree} node --input-type=module -e '
    const { readHostOverride, hostOverridePath } = await import(process.env.GRZ_OVR_TREE + "/src/config.mjs");
    const o = readHostOverride(hostOverridePath("agents.note9.json", process.env), process.env);
    process.stdout.write(String(o?.port ?? 8080));'
}
