#!/usr/bin/env bash
# grz-doctor.sh — detect-only alpha self-config checklist.
# Hard: no serve, no bounce, no fetch, no GGUF-on-8600, no gateway start.
set -euo pipefail

JSON=0
for arg in "$@"; do
  case "$arg" in
    --json|-j) JSON=1 ;;
    -h|--help)
      echo "Usage: grz-doctor.sh [--json]"
      echo "Detect-only: OS, GRZ_ROOT/EXE, llama, manifest, runtimes, models_missing, next."
      echo "Exit !=0 if llama MISSING or nexus Qwenstral model absent under models/."
      exit 0
      ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GRZ_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$GRZ_ROOT"

# --- OS ---
uname_s="$(uname -s 2>/dev/null || echo unknown)"
os_raw="$(printf '%s %s %s' "$uname_s" "${OSTYPE:-}" "${PREFIX:-}" | tr '[:upper:]' '[:lower:]')"
OS=unknown
if [[ -n "${TERMUX_VERSION:-}" ]] || [[ "${PREFIX:-}" == *com.termux* ]] || [[ "$os_raw" == *android* && -n "${PREFIX:-}" ]]; then
  OS="android/termux"
elif [[ "$os_raw" == *mingw* || "$os_raw" == *msys* || "$os_raw" == *cygwin* ]]; then
  OS=windows
elif [[ "$os_raw" == *linux* ]]; then
  OS=linux
elif [[ "$os_raw" == *darwin* ]]; then
  OS=darwin
fi

# --- GRZ_EXE hint ---
if [[ "$OS" == "windows" ]]; then
  GRZ_EXE="${GRZ_EXE:-.exe}"
else
  GRZ_EXE="${GRZ_EXE-}"
fi

# --- arch (G2 linux-aarch64) ---
ARCH="$(uname -m 2>/dev/null || echo unknown)"

# --- llama ---
LLAMA_STATUS=MISSING
LLAMA_PATH=""
if [[ -n "${GRZ_LLAMA:-}" && -f "$GRZ_LLAMA" ]]; then
  LLAMA_PATH="$GRZ_LLAMA"
  LLAMA_STATUS="OK"
elif [[ "$OS" == "linux" && ( "$ARCH" == "aarch64" || "$ARCH" == "arm64" ) && -f "$GRZ_ROOT/runtime/linux-aarch64/llama-server" ]]; then
  # G2 AVF: prefer glibc aarch64 subdir over flat x86_64 ELF
  LLAMA_PATH="$GRZ_ROOT/runtime/linux-aarch64/llama-server"
  LLAMA_STATUS="OK"
elif [[ -f "$GRZ_ROOT/runtime/llama-server${GRZ_EXE}" ]]; then
  # On aarch64 Linux, flat ELF is usually x86_64 — only accept if linux-aarch64 absent (already checked)
  if [[ "$OS" == "linux" && ( "$ARCH" == "aarch64" || "$ARCH" == "arm64" ) ]]; then
    : # leave MISSING; NEXT will point at fetch-linux-aarch64.sh
  else
    LLAMA_PATH="$GRZ_ROOT/runtime/llama-server${GRZ_EXE}"
    LLAMA_STATUS="OK"
  fi
elif command -v llama-server >/dev/null 2>&1; then
  LLAMA_PATH="$(command -v llama-server)"
  LLAMA_STATUS="OK"
fi

# --- manifest guess ---
MANIFEST_REL=""
if [[ -n "${GRZ_MANIFEST:-}" ]]; then
  # Accept absolute or pack-relative
  if [[ -f "$GRZ_MANIFEST" ]]; then
    MANIFEST_ABS="$GRZ_MANIFEST"
  elif [[ -f "$GRZ_ROOT/$GRZ_MANIFEST" ]]; then
    MANIFEST_ABS="$GRZ_ROOT/$GRZ_MANIFEST"
  else
    MANIFEST_ABS="$GRZ_MANIFEST"
  fi
  case "$MANIFEST_ABS" in
    "$GRZ_ROOT"/*) MANIFEST_REL="${MANIFEST_ABS#"$GRZ_ROOT"/}" ;;
    *) MANIFEST_REL="$MANIFEST_ABS" ;;
  esac
elif [[ "$OS" == "android/termux" ]]; then
  if [[ -f "$GRZ_ROOT/config/agents.note9.json" ]]; then
    MANIFEST_REL="config/agents.note9.json"
  else
    MANIFEST_REL="config/agents.android.json"
  fi
elif [[ "$OS" == "windows" ]]; then
  if [[ -f "$GRZ_ROOT/config/agents.windows-mvp.json" ]]; then
    MANIFEST_REL="config/agents.windows-mvp.json"
  else
    MANIFEST_REL="config/agents.cursor.json"
  fi
else
  MANIFEST_REL="config/agents.cursor.json"
fi
MANIFEST_ABS="$GRZ_ROOT/$MANIFEST_REL"
# If override was absolute outside pack, keep it
if [[ -n "${GRZ_MANIFEST:-}" && -f "${GRZ_MANIFEST}" && "$GRZ_MANIFEST" = /* ]]; then
  MANIFEST_ABS="$GRZ_MANIFEST"
fi

# --- runtimes ---
rt_ok() {
  local dir="$1" bin="$2"
  [[ -d "$GRZ_ROOT/runtime/$dir" && -f "$GRZ_ROOT/runtime/$dir/$bin" ]] && echo OK || echo MISSING
}
WHISPER_RT="$(rt_ok whisper-dist whisper-server)"
SD_RT="$(rt_ok sd-dist sd-server)"
PIPER_RT="$(rt_ok piper-dist piper)"
LINUX_AARCH64_RT="$(rt_ok linux-aarch64 llama-server)"

# --- models from manifest ---
NEXUS_BASENAME="Qwenstral-Small-3.1-0.5B.Q4_K_M.gguf"
MODELS_MISSING=()
NEXUS_PRESENT=0

collect_models() {
  local mf="$1"
  if [[ ! -f "$mf" ]]; then
    return 0
  fi
  # Prefer node (pack engines); fall back to python3.
  local out=""
  if command -v node >/dev/null 2>&1; then
    out="$(node -e '
const fs=require("fs");
const mf=process.argv[1];
let m; try { m=JSON.parse(fs.readFileSync(mf,"utf8")); } catch(e) { process.exit(0); }
const names=[];
for (const a of (m.agents||[])) {
  const raw=a.model||"";
  if (!raw) continue;
  const base=raw.replace(/\\/g,"/").split("/").pop();
  if (base && !names.includes(base)) names.push(base);
}
process.stdout.write(names.join("\n"));
' "$mf" 2>/dev/null || true)"
  elif command -v python3 >/dev/null 2>&1; then
    out="$(python3 -c '
import json,sys
try:
  m=json.load(open(sys.argv[1]))
except Exception:
  sys.exit(0)
seen=[]
for a in m.get("agents") or []:
  raw=a.get("model") or ""
  if not raw: continue
  base=raw.replace("\\\\","/").split("/")[-1]
  if base and base not in seen:
    seen.append(base)
print("\n".join(seen))
' "$mf" 2>/dev/null || true)"
  else
    # crude grep fallback
    out="$(grep -oE '"model"[[:space:]]*:[[:space:]]*"[^"]+"' "$mf" 2>/dev/null \
      | sed -E 's/.*"([^"/\\]+)"[[:space:]]*$/\1/' || true)"
  fi
  local base
  while IFS= read -r base; do
    [[ -z "$base" ]] && continue
    if [[ "$base" == "$NEXUS_BASENAME" || "$base" == *Qwenstral*Small* ]]; then
      NEXUS_BASENAME="$base"
    fi
    if [[ -f "$GRZ_ROOT/models/$base" ]]; then
      if [[ "$base" == "$NEXUS_BASENAME" || "$base" == *Qwenstral*Small* ]]; then
        NEXUS_PRESENT=1
      fi
    else
      MODELS_MISSING+=("$base")
    fi
  done <<< "$out"
}

collect_models "$MANIFEST_ABS"

# Explicit nexus check even if not listed (fail-closed)
if [[ -f "$GRZ_ROOT/models/$NEXUS_BASENAME" ]]; then
  NEXUS_PRESENT=1
fi

# --- next one-liner ---
NEXT=""
if [[ "$LLAMA_STATUS" != "OK" ]]; then
  if [[ "$OS" == "android/termux" ]]; then
    NEXT="install android-arm64 llama into runtime/ (deploy-android.sh / note9-termux-setup.sh)"
  elif [[ "$OS" == "windows" ]]; then
    NEXT="place llama-server.exe under runtime/ (Win CPU llama zip)"
  elif [[ "$OS" == "darwin" ]]; then
    NEXT="install native llama-server (brew/build); refuse Linux ELF"
  elif [[ "$OS" == "linux" && ( "$ARCH" == "aarch64" || "$ARCH" == "arm64" ) ]]; then
    NEXT="scripts/fetch-linux-aarch64.sh  # G2 glibc aarch64 (not android-arm64)"
  else
    NEXT="place llama-server under runtime/ (CPU only; never GGUF on 8600)"
  fi
elif [[ "$NEXUS_PRESENT" -eq 0 ]]; then
  NEXT="drop $NEXUS_BASENAME into models/"
elif [[ ${#MODELS_MISSING[@]} -gt 0 ]]; then
  NEXT="fetch/drop missing models: ${MODELS_MISSING[*]}"
elif [[ "$WHISPER_RT" == "MISSING" || "$SD_RT" == "MISSING" || "$PIPER_RT" == "MISSING" ]]; then
  NEXT="add runtime-modalities sidecar (whisper-dist/sd-dist/piper-dist) or accept degraded"
else
  case "$OS" in
    windows) NEXT="./start.cmd" ;;
    android/termux) NEXT="./termux-start.sh" ;;
    *) NEXT="./start.sh" ;;
  esac
fi

# --- print ---
models_missing_csv() {
  local i
  if [[ ${#MODELS_MISSING[@]} -eq 0 ]]; then
    echo -n ""
    return
  fi
  printf '%s' "${MODELS_MISSING[0]}"
  for ((i=1; i<${#MODELS_MISSING[@]}; i++)); do
    printf ',%s' "${MODELS_MISSING[$i]}"
  done
}

if [[ "$JSON" -eq 1 ]]; then
  # Build JSON via node/python for safe escaping
  _mm="$(models_missing_csv)"
  if command -v node >/dev/null 2>&1; then
    node -e '
const o={
  os: process.argv[1],
  GRZ_ROOT: process.argv[2],
  GRZ_EXE: process.argv[3],
  llama: process.argv[4]==="OK" ? {status:"OK", path: process.argv[5]} : {status:"MISSING"},
  manifest: process.argv[6],
  runtimes: { "whisper-dist": process.argv[7], "sd-dist": process.argv[8], "piper-dist": process.argv[9], "linux-aarch64": process.argv[13] },
  arch: process.argv[14],
  models_missing: process.argv[10] ? process.argv[10].split(",") : [],
  nexus: process.argv[11]==="1" ? "OK" : "MISSING",
  next: process.argv[12],
};
process.stdout.write(JSON.stringify(o,null,2)+"\n");
' "$OS" "$GRZ_ROOT" "$GRZ_EXE" "$LLAMA_STATUS" "${LLAMA_PATH:-}" "$MANIFEST_REL" \
  "$WHISPER_RT" "$SD_RT" "$PIPER_RT" "$_mm" "$NEXUS_PRESENT" "$NEXT" "$LINUX_AARCH64_RT" "$ARCH"
  else
    python3 -c '
import json,sys
mm=sys.argv[10].split(",") if sys.argv[10] else []
o={
  "os": sys.argv[1],
  "GRZ_ROOT": sys.argv[2],
  "GRZ_EXE": sys.argv[3],
  "llama": {"status":"OK","path":sys.argv[5]} if sys.argv[4]=="OK" else {"status":"MISSING"},
  "manifest": sys.argv[6],
  "runtimes": {"whisper-dist":sys.argv[7],"sd-dist":sys.argv[8],"piper-dist":sys.argv[9],"linux-aarch64":sys.argv[13]},
  "arch": sys.argv[14],
  "models_missing": mm,
  "nexus": "OK" if sys.argv[11]=="1" else "MISSING",
  "next": sys.argv[12],
}
print(json.dumps(o,indent=2))
' "$OS" "$GRZ_ROOT" "$GRZ_EXE" "$LLAMA_STATUS" "${LLAMA_PATH:-}" "$MANIFEST_REL" \
  "$WHISPER_RT" "$SD_RT" "$PIPER_RT" "$_mm" "$NEXUS_PRESENT" "$NEXT" "$LINUX_AARCH64_RT" "$ARCH"
  fi
else
  echo "OS:           $OS"
  echo "GRZ_ROOT:     $GRZ_ROOT"
  echo "GRZ_EXE:      ${GRZ_EXE:-(empty)}"
  if [[ "$LLAMA_STATUS" == "OK" ]]; then
    echo "llama:        OK $LLAMA_PATH"
  else
    echo "llama:        MISSING"
  fi
  echo "manifest:     $MANIFEST_REL"
  echo "arch:         $ARCH"
  echo "runtimes:"
  echo "  whisper-dist:  $WHISPER_RT"
  echo "  sd-dist:       $SD_RT"
  echo "  piper-dist:    $PIPER_RT"
  echo "  linux-aarch64: $LINUX_AARCH64_RT"
  if [[ ${#MODELS_MISSING[@]} -eq 0 ]]; then
    echo "models_missing: (none)"
  else
    echo "models_missing: ${MODELS_MISSING[*]}"
  fi
  echo "next:         $NEXT"
fi

EXIT=0
[[ "$LLAMA_STATUS" == "OK" ]] || EXIT=1
[[ "$NEXUS_PRESENT" -eq 1 ]] || EXIT=1
exit "$EXIT"
