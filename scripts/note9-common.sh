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
  local k
  k=$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n') || return 1
  [[ $k =~ ^[0-9a-f]{64}$ ]] || return 1
  ( umask 077; printf '%s' "$k" > "$tmp" ) || return 1  # no trailing newline (llama-server does not trim)
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

# ---------------------------------------------------------------------------
# Install / serve mutual exclusion (SD-24 / SD-33 / Race R1 / R2).
# Same lock for note9-verify-runtime.sh and note9-restart-serve.sh:
#   $HOME/.grz-install.lock  (mkdir + owner pid token)
# Prefer $PREFIX/bin/flock when present (.grz-install.flock). Without flock the
# mkdir path still holds the lock exclusively: cand dir is built with pid already
# written then renamed into place; cleanup removes $LOCK only if $LOCK/pid == $$;
# holders re-check with grz_install_lock_assert_held before a flip. Stale takeover
# restores the moved lock if the name is vacant on a pid mismatch (closes R1).
# ---------------------------------------------------------------------------
GRZ_INSTALL_LOCK_NAME=.grz-install.lock
GRZ_INSTALL_FLOCK_NAME=.grz-install.flock

grz_install_lock_paths() {
  local rp=${REALPATH:-realpath}
  GRZ_LOCK_HOME=$("$rp" -e -- "${HOME:?}") || return 1
  GRZ_LOCK=$GRZ_LOCK_HOME/$GRZ_INSTALL_LOCK_NAME
  GRZ_FLOCKF=$GRZ_LOCK_HOME/$GRZ_INSTALL_FLOCK_NAME
}

# Release only if we still own the lock (never delete another holder's token).
grz_install_lock_release() {
  local lock=${GRZ_LOCK:-${HOME:+$HOME/$GRZ_INSTALL_LOCK_NAME}}
  [[ -n $lock ]] || return 0
  if [[ -d $lock && ! -L $lock ]]; then
    local owner
    owner=$(cat -- "$lock/pid" 2>/dev/null || true)
    if [[ $owner == "$$" ]]; then
      rm -rf -- "$lock"
    fi
  fi
  unset GRZ_LOCK_OWNED
}

# Fail unless $LOCK/pid is still our pid (call before flip / stop+start critical section end).
grz_install_lock_assert_held() {
  local lock=${GRZ_LOCK:-${HOME:+$HOME/$GRZ_INSTALL_LOCK_NAME}}
  local owner
  owner=$(cat -- "$lock/pid" 2>/dev/null || true)
  if [[ $owner != "$$" ]]; then
    echo "ERROR: install lock not held by pid $$ (saw '${owner}'); refusing" >&2
    return 1
  fi
  return 0
}

# Acquire .grz-install.lock (and .grz-install.flock when $PREFIX/bin/flock exists).
# Non-blocking: refuses if another live holder exists. Sets GRZ_LOCK / GRZ_LOCK_OWNED.
grz_install_lock_acquire() {
  grz_install_lock_paths || { echo "ERROR: cannot resolve HOME for install lock" >&2; return 1; }
  local MV_BIN owner moved cand ASIDE
  if [[ -n ${PREFIX:-} && -x ${PREFIX}/bin/mv ]]; then MV_BIN=$PREFIX/bin/mv; else MV_BIN=mv; fi

  if [[ -n ${PREFIX:-} && -x ${PREFIX}/bin/flock ]]; then
    [[ -L $GRZ_FLOCKF ]] && { echo "ERROR: $GRZ_FLOCKF is a symlink; refusing" >&2; return 1; }
    ( umask 077; : >> "$GRZ_FLOCKF" ) || { echo "ERROR: cannot create $GRZ_FLOCKF" >&2; return 1; }
    exec 9>>"$GRZ_FLOCKF"
    "$PREFIX/bin/flock" -n 9 || { echo "ERROR: another install holds $GRZ_FLOCKF (flock); refusing" >&2; return 1; }
    if [[ -e $GRZ_LOCK || -L $GRZ_LOCK ]]; then
      [[ -L $GRZ_LOCK || ! -d $GRZ_LOCK ]] && { echo "ERROR: $GRZ_LOCK is not a plain directory; refusing" >&2; return 1; }
      owner=$(cat -- "$GRZ_LOCK/pid" 2>/dev/null || true)
      if [[ $owner =~ ^[0-9]+$ ]] && kill -0 "$owner" 2>/dev/null; then
        echo "ERROR: another install (pid $owner) holds $GRZ_LOCK; refusing" >&2
        return 1
      fi
      echo "removing stale $GRZ_LOCK (flock held; pid '${owner}' not running)" >&2
      rm -rf -- "$GRZ_LOCK"
    fi
    mkdir -m 700 -- "$GRZ_LOCK" 2>/dev/null || { echo "ERROR: cannot take $GRZ_LOCK; refusing" >&2; return 1; }
  else
    # Hardened mkdir path. Fresh acquire is mkdir (atomic; empty dirs must NOT be
    # overwritten — GNU mv -T onto an empty dir succeeds and would skip the empty-pid refuse).
    # Stale takeover: build cand with pid already written, move LOCK aside, verify owner, place cand.
    if mkdir -m 700 -- "$GRZ_LOCK" 2>/dev/null; then
      : # acquired fresh; pid written below
    else
      [[ -L $GRZ_LOCK || ! -d $GRZ_LOCK ]] && { echo "ERROR: $GRZ_LOCK is not a plain directory; refusing" >&2; return 1; }
      owner=$(cat -- "$GRZ_LOCK/pid" 2>/dev/null || true)
      [[ -n $owner ]] || { echo "ERROR: $GRZ_LOCK held (pid not written yet); refusing" >&2; return 1; }
      [[ $owner =~ ^[0-9]+$ ]] || { echo "ERROR: $GRZ_LOCK has a bad pid '$owner'; refusing" >&2; return 1; }
      if kill -0 "$owner" 2>/dev/null; then
        echo "ERROR: another install (pid $owner) holds $GRZ_LOCK; refusing" >&2
        return 1
      fi
      cand=$GRZ_LOCK_HOME/.grz-install.lock.cand.$$
      rm -rf -- "$cand"
      mkdir -m 700 -- "$cand" || { echo "ERROR: cannot create lock candidate" >&2; return 1; }
      echo $$ > "$cand/pid"
      ASIDE=$GRZ_LOCK_HOME/.grz-install.lock.stale.$$
      if ! "$MV_BIN" -T -- "$GRZ_LOCK" "$ASIDE" 2>/dev/null; then
        rm -rf -- "$cand"
        echo "ERROR: lost the race to take over $GRZ_LOCK; refusing" >&2
        return 1
      fi
      moved=$(cat -- "$ASIDE/pid" 2>/dev/null || true)
      if [[ $moved != "$owner" ]]; then
        # R1: if the name is vacant, put the live holder's lock back; never clobber a new LOCK.
        if [[ ! -e $GRZ_LOCK && ! -L $GRZ_LOCK ]]; then
          "$MV_BIN" -T -- "$ASIDE" "$GRZ_LOCK" 2>/dev/null || true
          echo "ERROR: lock changed hands during takeover (pid '$owner' -> '$moved'); restored to $GRZ_LOCK when vacant; refusing" >&2
        else
          echo "ERROR: lock changed hands during takeover (pid '$owner' -> '$moved'); the moved lock was left at $ASIDE (not restored). If pid '$moved' is not running, remove $ASIDE and retry; refusing" >&2
        fi
        rm -rf -- "$cand"
        return 1
      fi
      echo "taking over stale lock $GRZ_LOCK (pid $owner gone)" >&2
      if ! "$MV_BIN" -T -- "$cand" "$GRZ_LOCK" 2>/dev/null; then
        if [[ ! -e $GRZ_LOCK && ! -L $GRZ_LOCK ]]; then
          "$MV_BIN" -T -- "$ASIDE" "$GRZ_LOCK" 2>/dev/null || true
        fi
        rm -rf -- "$cand"
        echo "ERROR: another install took $GRZ_LOCK first; refusing" >&2
        return 1
      fi
      rm -rf -- "$ASIDE"
    fi
  fi
  echo $$ > "$GRZ_LOCK/pid"
  GRZ_LOCK_OWNED=1
  return 0
}
