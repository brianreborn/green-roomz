#!/bin/sh
# Clone green-agentz next to this repo. Roomz loads Brainz by GREEN_BRAINZ_ROOT.
# max-headroom-grok is not part of this fleet.
set -eu
roomz=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
parent=$(dirname "$roomz")
agentz=$parent/green-agentz
if [ ! -d "$agentz/.git" ]; then
  git clone --depth 1 https://github.com/brianreborn/green-agentz.git "$agentz"
fi
brainz=$agentz/systems/green-brainz
test -f "$brainz/host/cognitive-host.mjs"
echo "GREEN_BRAINZ_ROOT=$brainz"
echo "GREEN_ZKILLZ_SKILLS=$agentz/skills"
echo "Roomz branch for dogfood: disclosure-acceptance (not main)."
echo "Serve and dogfood on the fastest box, not the Athlon."
