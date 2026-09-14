# GrapheneOS surfaces (terse)

Full matrix: `/workspace/reviews/grapheneos-platform-matrix.md`.

| Label | Meaning | GRZ |
|-------|---------|-----|
| **G1** | Isolation harness only (Owner / Private Space / secondary users) | **No** Termux-in-Private-Space; not the llama host |
| **G2** | AVF Terminal (Debian linux guest) | Needs **linux-aarch64** llama (MISSING; do not reuse android-arm64) |
| **G3** | Owner Termux | **android-arm64** only; `$HOME/grz-runtime` (PF-M8: empty HOME fail-closed) |

**GOS-P3 staging:** operator push into a profile that cannot see owner `/data/local/tmp` — use `Download/grz` or another per-user path. **Not** for running Termux in Private Space.

**GOS-P7:** `deploy-android.sh` pushes `green-roomz-models.lock.json` (+ optional slim `.torrent` / note) into `/data/local/tmp/grz` beside models for Termux verify after copy.

Stock Note9 Termux path: `docs/note9-termux.md`.
