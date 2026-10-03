# Netmgmt distribution tracks (2026-09-12)

Operator locked **both** tracks (not either/or).

## Track A — Self-serve install (default for bandwidth/mirrors)

| Piece | Source |
|-------|--------|
| OPNsense installer | Official DVD/vga ISO (user fetch via script + mirror URL + SHA256) |
| Empty system disk | Local VBox VDI create |
| Kit disk / kit DVD | Our small authored ISO/VDI (docs+packages index); large layers self-fetch |
| Official OPNsense **VM** image | Optional base — user downloads from OPNsense mirrors; we document attach-kit steps |

Users with fast mirrors/local caches pull OPNsense themselves. We do not require pulling giant blobs from us.

## Track B — Full offline VM image artifact (build we produce)

| Piece | Intent |
|-------|--------|
| `grz-netmgmt-offline.ova` / VBox export (or qcow2) | Pre-installed OPNsense golden + kit volume mounted + snapshot `golden-netmgmt` |
| Build pipeline | From Track A media → automated install/harden → attach kit → snapshot → export |
| Audience | Air-gap / USB handoff / “just import” |
| Size | Large — publish checksum + optional split; prefer self-serve Track A when online |

Track B sits **alongside** official OPNsense VM images (document both: “import official OPNsense VM + attach kit” vs “import our full offline OVA”).

## Hard rules

- Official OPNsense bits always from opnsense.org mirrors (verify SHA256/sig).
- Our artifact = install/harden/kit glue + docs we author; attribute OPNsense.
- Snapshot-first: `fresh` → harden → `golden-netmgmt` before export.
- NAT default; bridged off-by-default.
- Self-serve scripts: `-Mirror`, `-OutDir`, checksum verify.

## OPNsense 26.7 DVD (Track A pointer)

- `https://pkg.opnsense.org/releases/26.7/OPNsense-26.7-dvd-amd64.iso.bz2` (~471M bz2)
- SHA256 `95cafedda6d5b22ce832e249dc2309110fbee19f813ad78cf28bb3d387186bfb`
- Also check official **VM** image offerings on https://opnsense.org/download/ for “alongside” path

Track A scripts: `knowledge/netmgmt/install-media/fetch-opnsense-iso.ps1` / `fetch-kit-layers.ps1` (`-OutDir`, `-Mirror`) + `catalog.json`. Board: `NETMGMT-OPNSENSE-INSTALL-MEDIA-2026-09-12.md`.
