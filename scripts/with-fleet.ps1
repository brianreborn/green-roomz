# Clone the rest of the local AGI next to this repo and print the env to use.
# Does not copy Brainz into green-roomz. Roomz loads it by GREEN_BRAINZ_ROOT.
# max-headroom-grok is not part of this fleet.
$ErrorActionPreference = 'Stop'
$roomz = Split-Path -Parent $PSScriptRoot
$parent = Split-Path -Parent $roomz
$agentz = Join-Path $parent 'green-agentz'
if (-not (Test-Path (Join-Path $agentz '.git'))) {
  git clone --depth 1 https://github.com/brianreborn/green-agentz.git $agentz
}
$brainz = Join-Path $agentz 'systems\green-brainz'
$skills = Join-Path $agentz 'skills'
if (-not (Test-Path (Join-Path $brainz 'host\cognitive-host.mjs'))) {
  throw "Brainz host missing at $brainz"
}
Write-Output "GREEN_BRAINZ_ROOT=$brainz"
Write-Output "GREEN_ZKILLZ_SKILLS=$skills"
Write-Output "Roomz branch for dogfood: disclosure-acceptance (not main)."
Write-Output "Skip this Athlon. Serve and dogfood on the fastest box you have."
