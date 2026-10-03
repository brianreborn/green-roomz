# Green-Roomz release readiness

**Owner:** Release Driver  
**Updated:** 2026-09-12 (box first wake)  
**Target:** security-capable local release (localhost; no public bind without API key)  
**Hard rules:** never GGUF on 8600 GT; never invent `/usage`; CPU llama only for chat unless operator says; never `git push` unless asked; no exploits; no reboot/lockdown stubs that no-op

## Fleet snapshot (now)

| Host | machineId | Connected | Role |
|------|-----------|-----------|------|
| qodesh | `19f2c19e-e100-49f0-8507-813d66727973` | **yes** | Athlon II / 8600 GT 224MB — CPU nexus only; old tar tree |
| shalom | `801f51e6-fe6a-4bad-b878-e4aa3de1127c` | **no** | Ryzen 7520U Vulkan APU — primary live GRZ |
| note9 / host | — | unknown | Profile focus; not in ListMachines yet |

## Trees

| Location | State |
|----------|-------|
| Box session | `/workspace/session/green-roomz` — not a git repo; tests **75/75** on Node 20 |
| Box patch pack | `/workspace/grz-src/{gateway,handoff,nexus,routing,util}.mjs` — **ahead** of session tree (all five differ) |
| shalom git | `C:\Users\brian\Documents\green-roomz` (offline) |
| shalom live cwd | Codex outputs tree (offline) |
| qodesh | `C:\Users\brian\Documents\green-roomz` from older tar — needs `/workspace/grz-src` copy |
| GitHub | `brianreborn/green-roomz` private — no push without explicit ask |

## Gates

| Gate | Status | Evidence |
|------|--------|----------|
| Box unit tests | **PASS** 75/75 | 2026-09-12 box `node --test` |
| Windows tests (shalom) | last known 51/51 | `data/deploy-report.json` 2026-08-28 (suite since grew) |
| Official-manifest smoke | last PASS on shalom | deploy-report smoke HTTP 200 code+text vulkan-all |
| Slash /auto + sanitizers | landed on shalom; in grz-src | handoff 2026-08-28 |
| Routing prettify | **NOT landed** | vision/audio enum filter + image-gen offlinePlan + clean reasons |
| qodesh parity | **behind** | old tar; copy grz-src then bounce |
| Security local cut | open | Boundary Reviewer: parsing, slash injection, lockdown/reboot must reject, CORS, model→IPC |
| Race / liveness cut | open | Race Reviewer: mailbox/IPC, cold starts |
| note9 host path | unknown | need machine registration or Termux/sidecar map |
| Pack beta | not started | after prettify + qodesh sync + reviewer pass |

## Open blockers (release-blocking)

1. **Prettify** — omit vision/audio from nexus AVAILABLE unless modality present; text-only draw → `image-generation-agent`; final reason only (no `after:vision without image part`).
2. **qodesh src lag** — apply `/workspace/grz-src` → qodesh `src\`, bounce serve, `/health` (CPU nexus only; no GGUF on 8600 GT).
3. **Stream ESC** — raw SSE ANSI/OSC still forwarded; content sanitize incomplete.
4. **Monitor stubs** — lockdown/reboot must hard-reject (not silent no-op).
5. **shalom offline** — cannot rebench or live-cut until laptop returns.

## Non-goals this cycle

- Install CUDA 6.5 / change NVIDIA drivers on Win11+8600
- Fetch missing 7 artifacts / EAGLE-3 convert
- Public bind / fleet WAN punch without explicit design pass
- `git push`

## Next cut candidates

A. Sync qodesh from `/workspace/grz-src` + health (machine online now)  
B. Land prettify into box session + grz-src, pack for both hosts  
C. Kick Boundary + Race reviewers on current tree for security-capable cut  
D. Wait for shalom; then live 9-line `/route` + beta pack

## Reviewer board index

- Boards live under `/workspace/reviews/`
- Teammates: Boundary Reviewer, Race Reviewer, Forensic Investigator, Review Board Viewer
