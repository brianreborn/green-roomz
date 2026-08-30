# Variants & council

## Variants — several models for one role

```json
"vision-layout-agent": {
  "runtime": "llama_server", "port": 8181, "system_policy": "policies/vision-layout.md",
  "default_variant": "internvl2-2b",
  "variant_port_base": 8281,
  "variants": [
    { "id": "qwen2.5-vl-3b", "model": "C:\\LocalAI\\qwen2.5-vl-3b-instruct-q4_k_m.gguf", "projector": "C:\\LocalAI\\qwen2.5-vl-3b-mmproj-f16.gguf" },
    { "id": "internvl2-2b",  "model": "C:\\LocalAI\\InternVL2-2B.Q4_K_M.gguf",          "projector": "C:\\LocalAI\\InternVL2-2B-mmproj.gguf" },
    { "id": "moondream",     "model": "C:\\LocalAI\\moondream2.q4.gguf",                "projector": "C:\\LocalAI\\moondream2-mmproj.gguf" }
  ]
}
```

At load, this expands to: `vision-layout-agent` (serves `default_variant`, port 8181)
and `vision-layout-agent@qwen2.5-vl-3b`, `@moondream` (own ports from
`variant_port_base`). Same routing / policy / capabilities / profiles.

- request `model: "vision-layout-agent@moondream"` pins a variant
- a modality-routed image request honours `model: "<alias>@<id>"` too
- each **`host/<name>` branch** sets its own `default_variant`
- also useful for code (1.5B ↔ 7B) and text later

`pinned: true` on an agent → eviction never touches it (dedicated warm serve).

## Council — run several, vote, flag the outlier

```
POST /v1/chat/completions
{ "council": { "of": "vision-layout-agent", "judge": "field-vote" },
  "messages": [ ... image + "extract the label fields as JSON" ... ] }
```

`council` = `true` (all variants of `model`) or
`{ of, variants[], judge, parallel, cascade, quorum }`.

**Cascade** (`cascade: true` or `/council cascade …`): run the base variant
alone first; convene the rest only if that answer is doubtful — an upstream
error/empty, or (field-vote judge / `json_schema` requested) it doesn't parse to
a JSON object. The cheap path records a `solo` scorecard row; the response
carries `council.cascade` + `council.escalated`.

**Quorum** (`quorum: N` or `/council quorum:N …`, N ≥ 2): fan out in parallel
and resolve — aborting the rest — as soon as N candidates return the same answer
(canonical JSON, else normalized text). Never reached → a normal full council.
Response carries `council.quorum` + `council.quorumReached`.

### `/council` slash — the same thing from any OpenAI client

```
/council [targets] [judge] [serial|parallel] [cascade] [quorum:N] <prompt>
```

- **targets** — a base alias (`vision-layout-agent`), a short name (`code`,
  `vision`, `text`, …), or a comma-list of ≥2 aliases. Omitted → the modality
  target (image → vision, audio → audio) or `model`.
- **judge** — `field-vote` (default) · `judge-model` · `similarity` (short:
  `vote` / `judge` / `similar`).
- `serial` / `parallel` — force the run mode (default: parallel iff all fit).

Examples: drop an image and send `/council extract the label fields as JSON`
(councils the vision variants, field-vote). `/council code similarity write a
retry helper`. Resolves to < 2 aliases → falls through to a normal single answer.

**Session default:** `/council on [targets] [judge]` makes every following turn
in the session a council; `/council off` clears it. `/council on <targets>
<prompt>` also runs the council on that turn. Persisted on the session like
`/faith`.

| judge | how | for |
|---|---|---|
| **field-vote** (default) | parse each answer as JSON, per-key **weighted** majority (weight = `0.5 + scorecard agree_rate` once a variant has ≥ 5 runs, else 1.0); outlier = most-dissenting variant | structured extraction — label compliance |
| **judge-model** | a judge alias (`gateway.council_judge_alias`, default nexus) picks the best | free text |
| **similarity** | medoid by embedding cosine via `semantic-embedding-agent`; far outlier flagged | free text, no judge prompt |

Runs **parallel** when every variant can admit without eviction, else **serial**
(each run evicts the previous — the memory-tight path; N× latency).

Response: the consensus answer + a `council` object (`variants`, `winner`,
`outlier`, `agreement`, and for field-vote the per-key `votes` and `abstained`) +
an `x-green-roomz-council` header.

## Scorecard — the bake-off ledger

With `gateway.council_dir` set, every council run appends a row to
`<dir>/scores.jsonl`, each variant tagged `winner | outlier | agreed | failed`.

```
green-roomz council-stats [task] [--json]

council scorecard [vision] - 137 runs

  vision-layout-agent@internvl2-2b   win 0.61  agree 0.94  outlier 0.03  fail 0.01   14200ms
  vision-layout-agent@qwen2.5-vl-3b  win 0.34  agree 0.91  outlier 0.06  fail 0.02   31800ms
  vision-layout-agent@moondream      win 0.05  agree 0.52  outlier 0.41  fail 0.06    9100ms

suggested default_variant: vision-layout-agent@internvl2-2b (agree 0.94, outlier 0.03 over 137 runs)
```

Workflow: run the council on real traffic → read the scorecard → promote the
winner to `default_variant` → drop the council. Auto-pruning a persistent
outlier is **not** automatic (the outlier is sometimes the only one right); it
is surfaced for the operator.

**Disagreements** — a turn where `agreement < 0.6` is a hard case. Its prompt and
every candidate answer are appended to `<council_dir>/disagreements.jsonl` for a
human-review or fine-tune set.

## Ideas not yet built

- **Cross-host council** — fan out to note9 + qodesh + shalom variants over the
  peer allowlist. Needs the host bring-ups (issues #2–#5).
- **Judge = the security-monitor** for policy-sensitive turns (it already
  observes hops; let it also adjudicate).
- **Checkpoint the winner's KV** (`snapshotModel`) so the next similar request
  warm-starts from the model that won last time.
- **Council over profiles, not just variants** — same model, `vulkan-all` vs
  `cpu-4`, to catch a quant/offload bug that changes the answer.
