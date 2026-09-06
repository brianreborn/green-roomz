# Internal language: stutter and fugue

Locked 2026-09-03 into `policies/frames/memory-feedback-loop.md` (cognitive
agents only). The prose *is* the implementation. This note is the mapping for
papers / green-agentz MFL follow-up. Do not narrate these as bookkeeping tokens.

## Why they belong on the six-state coordinate

The six states (derivation, attention, integration, partition, containment,
disintegration) are coordinates, not a queue. Stutter and fugue are not extra
states. They are failure modes and holds *on edges*:

| Edge | Concept | What it prevents |
|---|---|---|
| derivation → attention | **stutter** | emitting the wrong near-neighbor |
| attention → integration | **fugue** | durable records with the wrong associations, or none |

Fatigue does not move an item to a new state. It raises the chance that the
attention → integration edge fails.

## Stutter

Human example: "fr-(idge) fr-(?) freezer." Two concepts sit close in *meaning*
and in *utterance* (shared onset, overlapping lexeme). The first candidate is
almost right. Saying it is the mistake.

Stutter is a pre-commit hold: do not emit the first neighbor. Commit the one
that actually fits, or self-repair in place. It is not filler, not delay-for-show,
and not a speech pathology to copy as noise. If the pair stays tied, ask or
hand off — do not coin-flip.

Speculators make this worse if they decode the more common neighbor. The hold
is how the cognitive agent refuses that prior.

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

## L0 / L1 / L2 (humanistic cache, not CPU cache)

| Layer | What it is | Occupancy / refresh |
|---|---|---|
| **L0** | attention; short-term working set; DRAM-like | hold near **70%**; ~30% headroom for stutter-hold, integration, recovery. Refresh only by *intentional* rehearsal aimed at integration. |
| **L1** | near reminder: typical-mistake patterns (the fridge/freezer pair, the origin mix) | not a second working set; fires as the authorized exception to ordinary skip |
| **L2** | slower reminder / integrated store | same rule; never overrides policy, isolation, or containment |

Fill-to-full on L0 is how integration fails. 70% is a high threshold with room
to move. Occupancy *is* reported to the operator (working-set size); it is not
invented. Prefer operator-supplied `/usage`. Compaction is last-resort after a
dream pass, dropping payloads already committed to the user repository while
keeping a B+tree-like index in L0.

The agent must *negotiate with the user* what stays in L0, what is confirmed,
and what is dropped. Silent rewrite of the working set is forbidden.

## Predictive ripple

Green-roomz speculators (and any later predictive specialist) may ripple a
**confirmed** thought:

- **outward** — L0 into L1/L2 or another specialist
- **inward** — a reminder sharpening the next derivation

Unconfirmed predictions stay out of L0. Occupancy they invent is not
confirmation. Confirmation is a user-negotiated fact, or a successful
integration pass the user has agreed is in-bounds.

## Mapping onto existing MFL

Existing compiled fragment covers MFL-1..25 (six states, coordinate-not-clock,
bounded attention, containment ≠ deletion, origin, first-hand vs inherited,
no bookkeeping tokens). This note is the candidate for MFL-26.. when
`green-agentz/docs/memory-feedback-loop-requirements.md` is the home:

- MFL-26 stutter is a derivation→attention hold on meaning+utterance neighbors
- MFL-27 fugue is failed integration; fatigue raises it; rest + integration clear it
- MFL-28 L0 occupancy target ~70% with refresh headroom
- MFL-29 L0 refresh is intentional self-talk only; unintentional is rumination
- MFL-30 L1/L2 are reminder systems, not a second working set
- MFL-31 working-set use is negotiated with the user; no silent rewrite
- MFL-32 predictive ripple of confirmed thoughts only, outward or inward
- MFL-33 communicate working-set size/fill as operator fact; never invent; prefer operator `/usage`
- MFL-34 L0 holds an index (B+tree or equivalent) into the user repository LTM
- MFL-35 dream processing (intentional rehearsal) before any compaction
- MFL-36 compaction is last resort before fugue fill; never compact undreamed items
- MFL-37 local console is how the operator sees running processes and L0 fill

Critical kernels (nexus, safety, monitor) still do not carry this frame
(MFL-3 / MFL-21).

## Not this turn

Tree security patches and the beta zip stay gated on Fuzz Tester. This is
cognitive doctrine for the two working-set agents. Re-prime after deploy if
`promptSha` must match a checkpoint.
