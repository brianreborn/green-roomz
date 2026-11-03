#!/usr/bin/env bash
# Sourced helper: grz_is_shared_storage <resolved-path> -> 0 if on Android shared/adb storage.
# Prefix list: config/shared-storage-prefixes.txt (same file src/config.mjs reads). Looked up
# next to this script's tree (../config); no env knob can replace it. GRZ_SHARED_PREFIXES_EXTRA
# (a file) may only ADD prefixes (tests, extra mounts).
_grz_ss_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
GRZ_SHARED_PREFIXES=$_grz_ss_dir/../config/shared-storage-prefixes.txt
grz_is_shared_storage() {
  local p=$1 pre base
  [[ -f $GRZ_SHARED_PREFIXES ]] || { echo "ERROR: shared-storage prefix list $GRZ_SHARED_PREFIXES missing" >&2; return 0; }
  while IFS= read -r pre || [[ -n $pre ]]; do
    [[ -z $pre || $pre == \#* ]] && continue
    base=${pre%/}
    [[ $p == "$base" || $p == "$base"/* ]] && return 0
  done < <(cat -- "$GRZ_SHARED_PREFIXES"; if [[ -n ${GRZ_SHARED_PREFIXES_EXTRA:-} ]]; then cat -- "$GRZ_SHARED_PREFIXES_EXTRA"; fi)
  return 1
}
