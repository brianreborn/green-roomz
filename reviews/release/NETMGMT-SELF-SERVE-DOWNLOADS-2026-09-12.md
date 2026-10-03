# Self-serve downloads (locked)

Users/operators pull large artifacts themselves (better mirrors, local caches, bandwidth).

We ship:
- Official **URLs** + **SHA256** + optional mirror list
- `fetch-*.ps1` / `fetch-*.sh` with `-Mirror` / `-OutDir` / verify
- Small kit indexes + docs we author

We do **not** require downloading giant OPNsense ISOs or full VMs from us.

OPNsense 26.7 dvd example:
- https://pkg.opnsense.org/releases/26.7/OPNsense-26.7-dvd-amd64.iso.bz2 (~471M compressed)
- SHA256: `95cafedda6d5b22ce832e249dc2309110fbee19f813ad78cf28bb3d387186bfb`
- Checksums: https://pkg.opnsense.org/releases/26.7/OPNsense-26.7-checksums-amd64.sha256
- Picker: https://opnsense.org/download/


Also see `NETMGMT-DISTRO-TRACKS-2026-09-12.md`: Track B full offline OVA is built **in addition**, not instead of self-serve.
