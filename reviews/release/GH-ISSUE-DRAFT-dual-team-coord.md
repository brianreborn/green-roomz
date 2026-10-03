# GitHub issue draft — ready to paste

**Repo:** `brianreborn/green-roomz`  
**Title:** `coord: dual SuperGrok team sync / file locks`  
**Number:** *do not invent — fill after `gh issue create` / UI submit*  
**Suggested labels (create if missing):** `coord` `hold` `no-push` `lock` `team:this-newbot` `team:other-researcher`  
**Assignee:** `brianreborn` (operator). Agents comment with an `agent:` identity line — this box has no `gh` login on the last catalog pass.

Paste everything below the line into the issue body.

---

## Title

```
coord: dual SuperGrok team sync / file locks
```

## Body

```markdown
## Why

Two SuperGrok teams share `brianreborn/green-roomz` + `green-agentz` and the same Windows/box trees. We coordinate **here** (switchboard) plus one GitHub issue per workstream. We do **not** silent-edit mutex paths or `git push` unless the operator asks.

**Plan (box):** `/workspace/reviews/release/DUAL-TEAM-SYNC-HANDOFF-2026-09-12.md`  
**Draft source:** `/workspace/reviews/release/GH-ISSUE-DRAFT-dual-team-coord.md`

## Teams

| Slot | Identity | State |
|------|----------|--------|
| **THIS** | New Bot + specialists (active SuperGrok) | Live |
| **OTHER** | Researcher `09f2d365-d312-428c-870d-e733a6504c0d` | Idle — SuperGrok quota reset **ETA unknown** (operator must supply usage UI or usual reset) |

**Integrator (single):** THIS Release Driver for `src/gateway.mjs` / council / Brainz seam / `main` pushes.

## Known tips (do not invent more)

- Remote `main` = `eb4a9f7`
- Box dispatch land = **DISPATCH-FIX-01** in `/workspace/grz-src` (no land SHA; live bounce pending)
- `host/note9` is **42 behind** `main@eb4a9f7`

## Workstream issues (existing — do not duplicate)

- Note9 phone client: #2 (THIS)
- qodesh Windows: #4 (OTHER on wake)
- Shalom / vision: #1 (OTHER on wake)
- Brainz import-by-ref: #10 + Agentz #3
- Council HOLD: #7 / #8 / #9
- godslove / pqfreebsd: #5
- Dirty-tree audit: [Agentz #2](https://github.com/brianreborn/green-agentz/issues/2) (OTHER first job)

New trackers (file only if needed; comment the number here): dispatch-remaining, image-matrix 3OS+Note9 VM, knowledge-lib, fleet-console.

## Claim protocol

Before writing a mutex path, comment:

```
agent: THIS-NewBot | OTHER-Researcher-09f2d365
CLAIM
path: src/gateway.mjs
tree: grz-src | qodesh | shalom | session
issue: #<workstream>
until: <ISO or until UNCLAIM>
why: <one line>
```

On done/abort:

```
agent: …
UNCLAIM
path: …
status: done | aborted | handed-to-integrator
evidence: <board or test count — no invented SHA>
```

No silent push-race. **No `git push` unless operator asks** in this thread or the workstream issue.

## Mutex (short)

| Path | Default |
|------|---------|
| `src/gateway.mjs` | THIS integrator — OTHER no simultaneous edit |
| `src/routing.mjs` | THIS — DISPATCH-FIX-01 claimed (bounce pending) |
| `src/nexus.mjs` `handoff.mjs` `mailbox.mjs` | THIS |
| `config/agents.note9.json` `scripts/note9-*` `docs/note9-termux.md` | THIS — OTHER stay off |
| `config/agents.windows.json` Unicorn `scripts/fetch-models.mjs` | OTHER on wake |
| `C:\Users\brian\Documents\green-roomz` | OTHER — Agentz #2 audit before writes |
| `/workspace/session/fleet-console/**` | THIS |
| `wip/council-*` / `main` push | HOLD |

Full table: the handoff plan §5.

## Cadence

- OTHER idle: THIS posts `STILL-LIVE` on major claim changes.
- Both live: `STANDUP` comment **every 4 hours** (state zone).
- OTHER first duty: read the handoff packet, then comment `WAKE` **before any edit**.

## First 48h after WAKE (summary)

1. OTHER: Agentz #2 read-only git status/stash of qodesh dirty tree; Roomz #4; shalom inventory if connected.
2. THIS: remaining dispatch P0 (claim per file); 3-OS image matrix + Note9 VM docs; knowledge-lib (out of freeze); fleet-console.
3. THIS bounce of FIX-01 = **named `routing.mjs` only**, after audit note or operator greenlight.
4. Neither: push, council merge, whole-tree overwrite, note9+windows dual-edit, GGUF on 8600 GT.

## Current THIS claims (2026-09-12)

- `CLAIM path= /workspace/grz-src/routing.mjs why=DISPATCH-FIX-01 box ACCEPT 15/15 bounce pending`
- `gateway.mjs` unlocked for *new* writes — claim before touching
- windows / Unicorn / fetch-models / qodesh dirty tree: **reserved OTHER** (no THIS write claim)
```
