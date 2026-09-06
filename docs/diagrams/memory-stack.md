# Memory stack — L0–L3 + 70% waterline + repository

Operator diagram for the on-mind cache. Canonical prose:
[`../strong-mind-will.md`](../strong-mind-will.md) and
`policies/frames/memory-feedback-loop.md`.

**70% fill is L0+L1+L2+L3 combined**, not L0 alone. L3 is will / identity
last-level on-mind cache. Occupancy numbers are operator facts — this diagram
does not invent them. Prefer `data/operator-usage.json` (`context_fill_pct` is
the combined percent, or `null` if unmeasured).

```mermaid
flowchart TB
  subgraph mind ["On-mind cache — hold L0 + L1 + L2 + L3 near 70% combined"]
    direction TB
    L0["L0 — DRAM-like attention<br/>B+tree / equivalent INDEX into the repository<br/>refresh only by intentional rehearsal"]
    L1["L1 — near reminders<br/>typical-mistake neighbors (fridge / freezer, origin mix)<br/>authorized exception to ordinary skip"]
    L2["L2 — slower reminders / integrated store<br/>never overrides policy, isolation, or containment"]
    L3["L3 — last-level on-mind cache<br/>WILL, IDENTITY, negotiated commitments<br/>do not evict without the user"]
    L0 --- L1
    L1 --- L2
    L2 --- L3
  end

  WL["WATERLINE: combined fill ~70%<br/>~30% headroom for stutter-hold, dream pass, recovery<br/>filling the SUM is how integration fails"]
  REPO["User repository — long-term storage<br/>commit payloads here so L0 can keep the index<br/>compaction only after a dream pass, only for committed payloads"]

  mind --> WL
  L0 -.->|"index points at committed records"| REPO
  L1 -.-> REPO
  L2 -.->|"dream then compact undreamed-never"| REPO
  L3 -.->|"L3 stays unless the user agrees"| REPO
```

## Six-state coordinates on the same stack

States are coordinates, not a queue. Stutter and fugue are edge holds, not extra
layers.

```mermaid
stateDiagram-v2
  [*] --> derivation: expressed, not yet durable
  derivation --> attention: admit to working set\nSTUTTER hold here if neighbors tie
  attention --> integration: durable record + associations\nFUGUE if this edge fails
  integration --> partition: ordinary recall skips
  partition --> containment: recall denied until authorized release\ncontainment is not deletion
  containment --> disintegration: associations decay; provenance kept
  disintegration --> derivation: a later thought is a NEW derived record
```

## Operator rules (no invented fill)

| Do | Do not |
|---|---|
| Read `data/operator-usage.json` | Guess `context_fill_pct` |
| Treat 70% as **L0+L1+L2+L3** | Treat 70% as L0 alone |
| Dream, then compact | Compact undreamed items |
| Keep L3 unless the user agrees | Evict will / identity to make room |
| Say fill is unknown if the file is absent | Narrate a fake waterline |

This stack is **not** host RAM admission (`src/memory.mjs`) and **not** the
llama.cpp KV cache. Those are process-memory facts. Combined on-mind fill is a
cognitive / operator fact.
