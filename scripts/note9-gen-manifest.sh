#!/usr/bin/env bash
# Generate config/note9-runtime.SHA256SUMS from a staging dir (run on the build host).
# Usage: bash note9-gen-manifest.sh [--allow-no-model] <stage_root> <tree_src> <out_file>
#   Lists only the runtime dirs (bin lib models) that exist; never hides find/sha256sum errors.
#   Refuses: zero tree/ lines, zero models/ lines (unless --allow-no-model, dry runs only: the
#   header is then stamped DRYRUN), or any node_modules dir in the tree (npm-deps: none).
#   Prints the manifest sha256 (GRZ_MANIFEST_SHA256, give it out of band) with per-section
#   line counts (bin/lib/model/tree).
set -euo pipefail
ALLOW_NO_MODEL=0
die() { echo "ERROR: $*" >&2; exit 1; }
# --allow-no-model is accepted in any position; any other --option is refused.
POS=()
for a in "$@"; do
  case "$a" in
    --allow-no-model) ALLOW_NO_MODEL=1 ;;
    --*) die "unknown option $a" ;;
    *) POS+=("$a") ;;
  esac
done
(( ${#POS[@]} == 3 )) || die "usage: note9-gen-manifest.sh [--allow-no-model] <stage_root> <tree_src> <out_file> (flag in any position)"
STAGE=${POS[0]}; TSRC=${POS[1]}; OUT=${POS[2]}
[[ -d $STAGE ]] || die "stage root $STAGE missing"
[[ -d $TSRC ]] || die "tree src $TSRC missing"
nm=$(cd "$TSRC" && find . -name node_modules -not -path './.git/*' -print -quit)
[[ -z $nm ]] || die "node_modules present in tree ($nm); package.json has no runtime deps (npm-deps: none); refusing"
dirs=()
for d in bin lib models; do [[ -d $STAGE/$d ]] && dirs+=("$d"); done
TMP=$(mktemp "${OUT}.tmp.XXXXXX"); trap 'rm -f -- "$TMP"' EXIT
RT=$(mktemp); TR=$(mktemp); trap 'rm -f -- "$TMP" "$RT" "$TR"' EXIT
if (( ${#dirs[@]} )); then
  (cd "$STAGE" && find "${dirs[@]}" -type f -print0 | LC_ALL=C sort -z | xargs -0r sha256sum --) > "$RT"
fi
(cd "$TSRC" && find . -type f -not -path './.git/*' -not -path './config/note9-runtime.SHA256SUMS' \
    -not -path './.green-roomz-state/*' -not -name '*.local.json' -printf '%P\0' \
  | LC_ALL=C sort -z | xargs -0r sha256sum --) | sed 's#^\([0-9a-f]\{64\}\)  #\1  tree/#' > "$TR"
nbin=$(grep -c '  bin/' "$RT" || true); nlib=$(grep -c '  lib/' "$RT" || true)
nmodel=$(grep -c '  models/' "$RT" || true); ntree=$(grep -c '  tree/' "$TR" || true)
(( ntree > 0 )) || die "zero tree/ lines from $TSRC; refusing"
if (( nmodel == 0 )); then
  (( ALLOW_NO_MODEL == 1 )) || die "no models/ line (stage $STAGE has no model); refusing (--allow-no-model for dry runs only)"
  echo "WARNING: --allow-no-model: DRYRUN manifest, not for release" >&2
fi
{
  if (( ALLOW_NO_MODEL == 1 && nmodel == 0 )); then echo "# DRYRUN: no model line (--allow-no-model); not a release manifest"; fi
  echo "# Green-Roomz note9 manifest (sha256sum format), from scripts/note9-gen-manifest.sh"
  echo "# npm-deps: none"
  cat "$RT" "$TR"
} > "$TMP"
mv -f -- "$TMP" "$OUT"
echo "manifest $OUT sha256=$(sha256sum < "$OUT" | cut -d' ' -f1)  bin=$nbin lib=$nlib model=$nmodel tree=$ntree"
