#!/usr/bin/env bash
# Generate config/note9-runtime.SHA256SUMS from a staging dir (run on the build host).
# Usage: bash note9-gen-manifest.sh <stage_root> <tree_src> > note9-runtime.SHA256SUMS
# Then give the operator: sha256sum note9-runtime.SHA256SUMS  (-> GRZ_MANIFEST_SHA256, out of band)
set -euo pipefail
STAGE=${1:?stage root}; TSRC=${2:?tree src}
echo "# Green-Roomz note9 manifest generated $(date -u +%FT%TZ)"
( cd "$STAGE" && find bin lib models -type f -print0 2>/dev/null | LC_ALL=C sort -z | xargs -0r sha256sum )
( cd "$TSRC" && find . -type f -not -path './.git/*' -not -path './config/note9-runtime.SHA256SUMS' -not -path './.green-roomz-state/*' -not -name '*.local.json' -printf '%P\0' \
    | LC_ALL=C sort -z | xargs -0r sha256sum | sed 's#^\([0-9a-f]*\)  #\1  tree/#' )
