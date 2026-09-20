# GOS-P2 board (Release Driver, 2026-09-14)

Blocked: **GOS-P2 is not a concrete local code/docs gap** in this checkout. No GrapheneOS notes, no `deploy-android.sh`, no `fca99fd`, no `0.5.5` tag. Did not bounce serve, install, push, or remint zips.

## Git vs origin (this machine)

| Fact | Value |
|------|--------|
| CWD | `C:\Users\brian\Documents\green-roomz` |
| Branch | `main` **up to date with `origin/main`** |
| HEAD | `eb4a9f74bef93c2792c34041a03a0d33eb0f9e5f` |
| Remote | `https://github.com/brianreborn/green-roomz.git` |
| `package.json` version | `0.1.0` (not 0.5.5) |
| `fca99fd` | **not a valid object** (local `git cat-file` + GitHub commit search) |
| Tags | none |
| Dirty (uncommitted) | `deploy/make-embed.mjs`, `deploy/make-image.mjs`, `deploy/make-rerank.mjs`, `src/routing.mjs` |
| Untracked | `_bounce-backup-20260912/`, `data/_console/`, `data/_fuzz/` |
| Host branches | `origin/host/pixel8`, `origin/host/note9`, `origin/host/qodesh`, `origin/host/godslove` exist; **pixel8/note9 tips are `260db2a` (issue #1 vision 503), ~42 commits behind `eb4a9f7`** |

## GOS-P2 / GrapheneOS / deploy-android.sh

Workspace-wide search (`GOS-P2`, `GOS-P`, `GrapheneOS`, `deploy-android`): **zero hits**.

GitHub `brianreborn/green-roomz`: issues #1–#11; **no GOS-P2 issue**. Code/commit search for `GOS-P2`, `deploy-android.sh`, `fca99fd`: **empty**.

Closest tracked work is **#3 `host/pixel8`** (Tensor G3, **KernelSU**, not GrapheneOS) and **#2 `host/note9`**. Fleet docs assume Android + KernelSU / Magisk / Termux, not GrapheneOS.

Android artifacts that **do** exist here:

- `scripts/android-cross-build.ps1`, `scripts/android-sdk-ndk.ps1` (CPU pack, `ANDROID_PLATFORM=android-28`)
- `scripts/note9-*.sh` / `note9-sync-models.ps1`
- `config/agents.android.json`, `config/agents.note9.json`
- `src/hosts/android.mjs` (sidecar **client stub**, `:8199`)
- `deploy/adb-peer.mjs`
- Docs: `docs/fleet-targets.md`, `docs/note9-termux.md`, `docs/reviews/platform-note9-windows.md`

**Missing:** `deploy-android.sh`, GrapheneOS flash/AVB notes, `agents.pixel8.json`, version `0.5.5`, SHA `fca99fd`.

## Why not a local patch

GOS-P2 was named as the only hard blocker, but this tree has **no spec** for it. Inventing GrapheneOS deploy (unlock, factory images, verified boot, Magisk vs GOS hardening) would be fiction and would violate “smallest patch / prefer existing work.”

Sibling preference **0.5.5 + `fca99fd`**: **not on this disk and not on `origin`**. Do not remint.

## Smallest next patch (after operator)

1. **Operator:** define GOS-P2 in one sentence (issue #, Pixel 8 GrapheneOS flash, APK, Termux, or something else). Point at `fca99fd` / 0.5.5 if they live in another repo or zip.
2. If GOS-P2 = Pixel 8 bring-up: land **`config/agents.pixel8.json`** from `agents.android.json` (8 GB limits) + a **`scripts/deploy-android.sh`** that wraps existing `adb` + Termux copy from `docs/note9-termux.md` / `android-cross-build.ps1` — **do not flash GrapheneOS from this Windows tree**.
3. If GOS-P2 = GrapheneOS install: needs **DUT + factory images + operator USB**; cannot be completed from Documents-only checkout.
4. Do not merge `host/pixel8` onto `main` until rebased onto `eb4a9f7`.

## Operator step

Reply with: (a) GOS-P2 definition / issue number, (b) where `fca99fd` / 0.5.5 lives, or (c) “write `deploy-android.sh` as Termux CPU-pack push only.” Until then, **hold**.
