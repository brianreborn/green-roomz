#!/usr/bin/env bash
set -euo pipefail
export GRZ_ROOT="$(cd "$(dirname "$0")" && pwd)"
# Unix: empty suffix. Windows start.cmd sets GRZ_EXE=.exe for ${GRZ_ROOT}/runtime/llama-server${GRZ_EXE}.
export GRZ_EXE="${GRZ_EXE-}"
cd "$GRZ_ROOT"

uname_s="$(uname -s 2>/dev/null || echo unknown)"
os_raw="$(printf '%s %s' "$uname_s" "${OSTYPE:-}" | tr '[:upper:]' '[:lower:]')"
os=unknown
case "$os_raw" in
  *mingw*|*msys*|*cygwin*) os=msys ;;
  *linux*) os=linux ;;
  *freebsd*) os=freebsd ;;
  *openbsd*) os=openbsd ;;
  *netbsd*) os=netbsd ;;
  *darwin*) os=darwin ;;
esac

if ! command -v node >/dev/null 2>&1; then
  echo "Need Node.js on PATH (pack engines field says >=22; Node 20 has been used successfully)" >&2
  exit 1
fi

# PF4: detect OS *before* chmod. Do not chmod a foreign Linux ELF so -x fools BSD/Darwin.
is_linux_elf() {
  local f="$1"
  [[ -f "$f" ]] || return 1
  if command -v file >/dev/null 2>&1; then
    file -b "$f" 2>/dev/null | grep -qi 'ELF.*Linux\|ELF 64-bit LSB.*x86-64' && return 0
    file -b "$f" 2>/dev/null | grep -qi 'ELF' && file -b "$f" 2>/dev/null | grep -qi 'Linux' && return 0
    # Heuristic: ELF magic + OSABI System V often used by Linux toolchains
    if command -v readelf >/dev/null 2>&1; then
      readelf -h "$f" 2>/dev/null | grep -qi 'OS/ABI:.*UNIX - System V' && return 0
    fi
  fi
  # magic bytes ELF
  local mag
  mag="$(dd if="$f" bs=4 count=1 2>/dev/null | LC_ALL=C od -An -tx1 | tr -d ' \n')"
  [[ "$mag" == "7f454c46" ]] || return 1
  return 0
}

pick_llama() {
  local bundled="$GRZ_ROOT/runtime/llama-server"
  case "$os" in
    linux)
      if [[ -f "$bundled" ]]; then
        chmod +x "$bundled" 2>/dev/null || true
        if [[ -x "$bundled" ]]; then
          export GRZ_LLAMA="$bundled"
          return 0
        fi
      fi
      echo "Missing $bundled (Linux x86_64 binary expected in this pack)" >&2
      return 1
      ;;
    freebsd|openbsd|netbsd|darwin)
      # Refuse Linux ELF even if present and chmod +x would succeed
      if [[ -f "$bundled" ]] && is_linux_elf "$bundled"; then
        echo "Bundled runtime/llama-server is a Linux ELF; refusing on $os" >&2
        bundled=""
      fi
      if [[ -n "$bundled" && -f "$bundled" ]] && ! is_linux_elf "$bundled"; then
        chmod +x "$bundled" 2>/dev/null || true
        if [[ -x "$bundled" ]]; then
          export GRZ_LLAMA="$bundled"
          return 0
        fi
      fi
      if command -v llama-server >/dev/null 2>&1; then
        export GRZ_LLAMA="$(command -v llama-server)"
        return 0
      fi
      if [[ "$os" == "darwin" ]]; then
        echo "No native llama-server. brew install llama.cpp or build from ggml-org/llama.cpp" >&2
      else
        echo "No native llama-server. pkg install llama-cpp or build from ggml-org/llama.cpp" >&2
      fi
      return 1
      ;;
    msys)
      echo "Windows: run start.cmd (cmd.exe), not this bash file" >&2
      return 1
      ;;
    *)
      echo "Unrecognized OS ($uname_s / ${OSTYPE:-}); trying Linux-style runtime/" >&2
      if [[ -f "$bundled" ]]; then
        chmod +x "$bundled" 2>/dev/null || true
        export GRZ_LLAMA="$bundled"
        return 0
      fi
      return 1
      ;;
  esac
}

case "$os" in
  linux)
    export LD_LIBRARY_PATH="$GRZ_ROOT/runtime${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
    ;;
  freebsd|openbsd|netbsd)
    # PF4: merge, do not clobber /usr/local/lib
    export LD_LIBRARY_PATH="$GRZ_ROOT/runtime:/usr/local/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
    ;;
  darwin)
    export DYLD_LIBRARY_PATH="$GRZ_ROOT/runtime:/usr/local/lib${DYLD_LIBRARY_PATH:+:$DYLD_LIBRARY_PATH}"
    export LD_LIBRARY_PATH="$GRZ_ROOT/runtime:/usr/local/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
    ;;
  *)
    export LD_LIBRARY_PATH="$GRZ_ROOT/runtime${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
    ;;
esac

pick_llama || exit 1

echo "Green-Roomz portable pack"
echo "OS=$os GRZ_ROOT=$GRZ_ROOT GRZ_EXE=${GRZ_EXE-} GRZ_LLAMA=$GRZ_LLAMA"
echo "node=$(command -v node) $(node -v 2>/dev/null || true)"
echo "gateway http://127.0.0.1:8080"
exec node bin/green-roomz.mjs serve --manifest config/agents.cursor.json --host 127.0.0.1 --port 8080
