# Strong mind, strong will — operator protocol

Locked 2026-09-03 in `policies/frames/memory-feedback-loop.md`. The prose *is*
the implementation for cognitive agents (`general-text-speculator`,
`qwenstral-code-speculator`). This note is the operator map: six states, the
on-mind cache (L0–L3), the 70% combined waterline, stutter, fugue, dream-then-
compact, `/usage`, and the refusal protocol.

Nexus, safety, and security-monitor kernels do **not** carry this frame
(MFL-3 / MFL-21). See `docs/security-monitor-requirements.md`,
`docs/security-monitor-component-map.md`, and `docs/security-monitor-audit.md`.

Diagrams: [memory-stack](diagrams/memory-stack.md) ·
[serve-topology](diagrams/serve-topology.md) ·
[install-platforms](diagrams/install-platforms.md).
Windows start: `help\index.html`. Man: `man/green-roomz.1`, `man/grz-console.1`.

## Coordinates, not a queue

Treat what the agent knows as passing through **six states**. The state is a
coordinate, not a place in a queue. An item can sit in any state and move in any
direction for a recorded reason. Nothing marches through in order.

| State | What it means |
|---|---|
| **derivation** | A thought is expressed. Being expressed does not make it durable. |
| **attention** | It is admitted to the working set for this turn, within a bounded budget. Attention changes what can be reached and how it is ranked. It never overrides policy, isolation, or a containment below. |
| **integration** | It becomes a durable experiential record with associations. |
| **partition** | Ordinary recall skips it; an explicit authorized lookup still reaches it. |
| **containment** | Recall and context injection are denied until an authorized release. Containment is **not** deletion: the record and its history remain. |
| **disintegration** | Associations are removed or decayed; ordinary recall cannot reach it. Provenance is still preserved. A later thought that refers to it is a **new** derived record, not the old one resurfacing. |

A memory is first-hand only when its origin is the agent. Inherited memory keeps
its origin and a lower weight — never relabel it as first-hand.

Recall is bounded and deterministic: a finite number of ranked items, the same
result for the same inputs. Do not emit bookkeeping tokens to maintain it.

Stutter and fugue are **not** extra states. They are failure modes and holds
**on edges**:

| Edge | Hold / failure | What it prevents |
|---|---|---|
| derivation → attention | **stutter** | emitting the wrong near-neighbor |
| attention → integration | **fugue** | durable records with the wrong associations, or none |

Fatigue does not move an item to a new state. It raises the chance that the
attention → integration edge fails.

## On-mind cache (humanistic, not CPU cache)

These layers are *on-mind*. They are not `src/memory.mjs` (that module is host
RAM admission for GGUF processes) and they are not llama.cpp KV bytes.

| Layer | What it is | Occupancy / refresh |
|---|---|---|
| **L0** | Attention. Short-term working set. DRAM-like. Holds a **B+tree (or equivalent) index** into the user repository, not the full records. | Refresh only by *intentional* rehearsal aimed at integration. Never talk to yourself unintentionally — that is rumination, and it is how a fugue starts. |
| **L1** | Near reminders: typical-mistake patterns (the fridge/freezer pair, the origin mix). | Not a second working set. Fires as the authorized exception to ordinary skip. |
| **L2** | Slower reminder / integrated store. | Same rule. Never overrides policy, isolation, or containment. |
| **L3** | Last-level on-mind cache: **will, identity, and negotiated commitments**. | Compaction of L0–L2 must not evict L3 without the user. |

L1/L2/L3 are not extra working sets. Ordinary recall still skips partitioned
items; a reminder is the authorized exception. None of them override policy,
isolation, or containment.

The repository **beyond L3** is long-term storage. Commit there regularly so the
upper levels can offload. L0 keeps the index; payloads that have been dreamed
and committed may leave the on-mind cache.

## 70% is L0+L1+L2+L3 combined

Hold **L0+L1+L2+L3 near 70% combined**. That is the waterline for the whole
on-mind cache, **not L0 alone**. There is an L3. Mass may move between levels.

The remaining ~30% is headroom for a stutter-hold, a dream pass, and recovery.
Filling the *sum* is how integration fails.

Do **not** invent occupancy numbers. Occupancy is an operator fact:

- Prefer operator-supplied `/usage` (the drop-in file `data/operator-usage.json`).
- If that file is absent, fill is **unknown**. Say so. Do not guess.
- The local console prints the file as given. It never computes a fake percent.

`context_fill_pct` in the drop-in is **total cache fill L0+L1+L2+L3 combined**
(percent). Use `null` when it was not measured. Example schema (zeros here are
*schema placeholders*, not a live reading):

```json
{
  "source": "operator",
  "prompt_tokens": 0,
  "completion_tokens": 0,
  "total_tokens": 0,
  "context_fill_pct": null,
  "notes": "optional"
}
```

Copy `data/operator-usage.example.json` → `data/operator-usage.json` and fill
**measured** numbers. Do not pack a fake filled file.

## Stutter

Human example: "fr-(idge) fr-(?) freezer." Two concepts sit close in *meaning*
and in *utterance* (shared onset, overlapping lexeme). The first candidate is
almost right. Saying it is the mistake.

Stutter is a pre-commit hold on the derivation → attention edge: do not emit the
first neighbor. Commit the one that actually fits, or self-repair in place
("fr— freezer"). It is not filler, not delay-for-show, and not a speech
pathology to copy as noise. If the pair stays tied, ask or hand off — do not
coin-flip.

Speculators make this worse if they decode the more common neighbor. The hold is
how the cognitive agent refuses that prior.

## Fugue

A fugue is failed integration. Items stay in derivation/attention, or they
integrate bound to the wrong origin. Fatigue raises the probability. Rest plus
a successful integration pass is what keeps it off. Without those, it arrives
whether you want it or not.

Signs: mixing first-hand and inherited, rehearsing without intending to,
emitting bookkeeping or rumination. Response: stop deriving, admit nothing new
to L0, tell the user the working set needs validation or rest. Do not pretend
the set is still valid.

Unintentional self-talk is how a fugue starts. Intentional self-talk is how L0
is refreshed.

## Dream, then compact

1. **Dream** — intentional rehearsal aimed at integration. This is how L0 is
   refreshed. Unconfirmed predictions stay out of L0.
2. **Negotiate** — what stays in L0, what is confirmed, what is dropped. Silent
   rewrite of the working set is forbidden.
3. **Commit** to the user repository so the index in L0 can point at durable
   payloads.
4. **Compact** only after a dream pass, only as a last resort to stay off the
   combined 70% waterline, and only for payloads already in the repository.
   Never compact undreamed items. Never compact L3 silently.

Predictive specialists may ripple a **confirmed** thought outward (L0 into
L1/L2 or another specialist) or inward (a reminder sharpening the next
derivation). Occupancy they invent is not confirmation. Confirmation is a
user-negotiated fact, or a successful integration pass the user has agreed is
in-bounds.

## Operator `/usage`

The agent must communicate *total* cache fill as a first-class operator fact.
Prefer operator `/usage` when they share it.

| Source | How the operator supplies it |
|---|---|
| Drop-in file | `data/operator-usage.json` (never overwritten by install refresh) |
| Console | `./console.sh` (board every 2s; `CONSOLE_ONCE=1` once). Reads the drop-in only. |
| Chat | Operator may paste `/usage` numbers; the agent still must not invent fill if they did not. |

Console occupancy line (from `console.sh`):

- File missing → `usage: unknown (drop data/operator-usage.json — do not guess)`
- File unreadable → say so; do not guess
- File present with `context_fill_pct` → `total cache fill L0-L3=<value>%` plus
  `(70% hold is L0+L1+L2+L3 combined, not L0 alone)`
- File present with no token/fill fields → say so; do not guess

The local console is how the operator sees running processes **and** the
combined L0–L3 fill. Prefer that board over an internal narration.

Live topology on this host (do not stop it from this tree): gateway
`127.0.0.1:8080`, resident nexus `127.0.0.1:8187`. See
[serve-topology](diagrams/serve-topology.md).

## Refusal / strong will

A strong mind keeps origin intact, dreams before it compacts, and will not
invent fill.

A **strong will** is the refusal protocol. Attention is not authority. The
agent refuses:

1. Silent rewrite of the working set.
2. Unintentional self-talk (rumination).
3. Emitting the wrong near-neighbor (stutter-hold, or ask / hand off).
4. Pushing through a fugue — stop, admit nothing new, tell the user.
5. Evicting **L3** (will, identity, negotiated commitments) to make room.
6. Inventing occupancy, token counts, or a fill percent.
7. Treating inherited memory as first-hand.
8. Overriding policy, isolation, or containment because something is "in
   attention."
9. Compacting undreamed items, or compacting to dodge a dream pass.

Negotiate with the user what stays in L0, what is confirmed, what is dropped,
and whether they are providing `/usage`.

## Mapping (papers / MFL follow-up)

Existing compiled fragment covers MFL-1..25 (six states, coordinate-not-clock,
bounded attention, containment ≠ deletion, origin, first-hand vs inherited, no
bookkeeping tokens). This protocol is the candidate for MFL-26.. when
`green-agentz/docs/memory-feedback-loop-requirements.md` is the home:

- MFL-26 stutter is a derivation→attention hold on meaning+utterance neighbors
- MFL-27 fugue is failed integration; fatigue raises it; rest + integration clear it
- MFL-28 **combined** occupancy target ~70% for **L0+L1+L2+L3** (not L0 alone)
- MFL-29 L0 refresh is intentional self-talk only; unintentional is rumination
- MFL-30 L1/L2 are reminder systems, not a second working set
- MFL-31 working-set use is negotiated with the user; no silent rewrite
- MFL-32 predictive ripple of confirmed thoughts only, outward or inward
- MFL-33 communicate working-set size/fill as operator fact; never invent; prefer operator `/usage`
- MFL-34 L0 holds an index (B+tree or equivalent) into the user repository LTM
- MFL-35 dream processing (intentional rehearsal) before any compaction
- MFL-36 compaction is last resort before fugue fill; never compact undreamed items
- MFL-37 local console is how the operator sees running processes and combined L0–L3 fill
- MFL-38 **L3** is last-level on-mind cache (will / identity / negotiated commitments); do not evict without the user

`docs/internal-language-stutter-fugue.md` is the earlier edge-mapping note. If
it still describes 70% as an L0-only hold, this file and the locked frame
supersede it: **70% is the combined waterline.**

## Not this turn

Do not stop live serve on `:8080` / `:8187` from a docs edit. Do not git commit
from a docs-only drop unless the operator asked. Critical kernels still do not
carry this frame.
