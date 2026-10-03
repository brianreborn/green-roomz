# DISPATCH-FIX-01 review — Release Driver

**Date:** 2026-09-12  
**Verdict:** **ACCEPT** (box) · **LIVE BOUNCE PENDING** (qodesh)

## Review

- Board policy matches `resolveExplicitModelPin` in `/workspace/grz-src/routing.mjs`
- Unknown → ValidationError 400; unavailable → pin → gateway 503; auto/sentinels → nexus; sticky available without lock → nexus (documented residual)
- `isRouterSentinel` no longer treats unknown as auto
- Box: `node --test …/resolve-explicit-model-pin.test.mjs` → **15 pass / 0 fail**
- gateway/nexus/handoff unchanged per board (first-hop UnavailableError path relied upon)

## Bounce

- Staged: qodesh `C:\Users\brian\Documents\green-roomz\_bounce-backup-20260912\routing.mjs.from-box`
- Install/serve/curl gates **not completed** — machine local-exec unreachable/hang mid-command
- Retry via `/workspace/reviews/release/qodesh-bounce-fallthrough.ps1` (CopyFromBox then run on qodesh)

## Non-actions

No push, no merge, no reboot.

## Live bounce
CLOSED — see DISPATCH-FIX-01-BOUNCE-2026-09-12.md
