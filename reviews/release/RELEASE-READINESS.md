# Green-Roomz release readiness

**Owner:** Release Driver  
**Room:** Note9 Release (ship brand pivoted)  
**Updated:** 2026-09-12 (GOAL PIVOT)  
**Absolute-top ship artifact:** offline security-enhanced **Linux or BSD workstation image** — Green-Roomz + defensive analysis/testing suite + full fleet model packs (airgap-capable).  
**note9:** client / UAT only — **not** the release cut brand.  
**Authority:** `/workspace/reviews/release/GOAL-PIVOT-2026-09-12.md` · plan `OFFLINE-SECURITY-WORKSTATION-PLAN-2026-09-12.md` · dispatch catalog `DISPATCH-BUGS-2026-09-12.md`

**Hard rules:** defensive only · no exploits/PoCs · no reboot/lockdown · no `git push` unless asked · never GGUF on 8600 GT · never invent `/usage` · CPU llama for chat unless operator says · dual-team ownership (other Researcher `09f2d365…`)

## Priority freeze

| Rank | Work | Status |
|------|------|--------|
| **P0** | Dispatch-wonky majors | **#1 CLOSED live** — qodesh bounce 2026-09-12: unknown→400, image-gen→503, auto→200 nexus; speech cold→200 sticky (policy-correct). Next: vision-first/prettify + BND-03 |
outing.mjs.from-box`; local-exec flaked unreachable before install/serve. Script ready: `qodesh-bounce-fallthrough.ps1`. Retry bounce when machine sticks. No push |
| **P0** | Pack/image design (OS base TBD Linux vs BSD; model-pack inventory; security suite bill) | Parent plan up; MODEL-PACK may land separately |
| **Hold** | Council merges (`wip/council-*`) | frozen unless operator asks |
| **Queued** | Platform PATH packs | behind dispatch freeze (Researcher lock) |
| **Queued** | Boundary High packs (BND-01/02/03…) | fold after / with dispatch P0s per integrate order |
| **Client** | note9 Termux Issue #2 | UAT track only |

## Dispatch P0 gate (image freeze)

From `DISPATCH-BUGS-2026-09-12.md` + Researcher lock:

1. Silent wrong/unknown `model` → tool-router HTTP 200 (FUZZ-FALLTHROUGH-*) — reject/503  
2. Vision-first hop / `|after:vision without image part` — land prettify enum filter from `grz-src`, bounce live  
3. Null/malformed chat body hang (≥12s) — fast 400  
4. Slash first-hop skips modality/capability (`/vision` no image; `/tts` 500)  

Also tracked majors (not freeze-block unless operator elevates): text-only image-gen → general-text; mailbox null throw; unicode→500; `/router` visibility.

## Trees

| Tree | Role |
|------|------|
| `main@eb4a9f7` (+ `381491c` sanitizers / slash) | tip lineage cited on boards |
| `/workspace/grz-src` | patch drop: enum filter + sanitizers ahead of box session |
| `/workspace/session/green-roomz` | box session (authoritative local; behind grz-src) |
| qodesh / shalom | build/dogfood Windows — not the ship OS image |
| note9 | client UAT when registered |

## Gates (workstation image)

| Gate | Status | Owner |
|------|--------|-------|
| Dispatch P0s closed | **OPEN** | Release Driver + Fuzz + Boundary + Race |
| Box unit tests | PASS 75/75 | Release Driver |
| Boundary Highs | graded open | Boundary Reviewer |
| Platform note9 | F (client) | Platform Reviewer |
| OS base pick (Debian-class vs FreeBSD/PQ) | **open Q** | operator |
| Model pack + checksums | inventory pending | Release Driver + Parent |
| Security suite smoke offline | planned §3 of workstation plan | Release Driver |
| Peer/tunnel | design-only | — |
| Image UAT S1–S8 | blocked on P0 + packs | Release Driver |

## Integrate order (when unfrozen)

1. Fallthrough reject/503 — **parent patching `/workspace/grz-src`**; review on `DISPATCH-FIX-01-fallthrough-2026-09-12.md`; then qodesh bounce (notes ready). No merge/push  
2. Session ← grz-src sanitizers + modality/slash gates (BND-02/03)  
3. Prettify enum filter + offlinePlan image-gen + clean reasons (cut-2 / vision-first)  
4. Null-body fast 400  
5. Exact `/route` + fixed upstream paths (BND-01)  
6. Then queued Platform PATH / remaining Boundary · then image freeze

## Hold line

No council merges. No platform pack integrate ahead of dispatch P0. No push. note9 files only as client UAT when Brian registers the machine.

## Index

- Pivot: `GOAL-PIVOT-2026-09-12.md`
- Plan: `OFFLINE-SECURITY-WORKSTATION-PLAN-2026-09-12.md`
- Dispatch: `DISPATCH-BUGS-2026-09-12.md`
- Boundary: `/workspace/reviews/boundary/BOARD.md`
- Platform: `/workspace/reviews/platform/BOARD.md`
- note9 client detail: `note9-release-plan-2026-09-12.md` (superseded as ship brand)

## AFK track (2026-09-12)

| Track | Status | Owner |
|-------|--------|-------|
| DISPATCH-FIX-01 fallthrough | **CLOSED live** · GH [PR #12](https://github.com/brianreborn/green-roomz/pull/12) `fix/dispatch-01-explicit-model-pin` — do **not** rewrite `routing.mjs` in parallel; post-merge sync only (Senior Dev bounce; BND-04 closed). Staged file updated post-NATIVE_CHAT merge | Release Driver |
| VBox lab (`fresh`→`golden`) | Watch + include `/workspace/knowledge/netmgmt/` kit on golden via shared folder/ISO when UAC clears. Watch `/workspace/reviews/release/NETMGMT-VBOX-SNAPSHOT-PLAN-2026-09-12.md` — keep Machine Folder **off C:** (C: ~9GB free, still tight for VDI+snaps) | Release Driver (watch) |
| FX4100 / T-Mobile docs | `/workspace/knowledge/fx4100/` | Researcher |
| No push | standing | all |

## Nexus / model iterate (THIS team)

Operator priority: improve tool-router nexus via **model-pack + eval harness** — see `NEXUS-MODEL-ITER-LANE-2026-09-12.md`.  
**Do not block** on gateway P0#2 (OTHER). `routing.mjs` mutex for PR #12 only.
