# Stock system-prompt compilation

The system prompt each agent runs is **compiled** from layered fragments and
committed to the repo under `build/prompts/`. `green-roomz compile` is the build;
`build/prompts/` is the output; the git diff of that directory is the auditable
record of what changed in an agent's operating doctrine.

## The prose is the implementation

For a prompt-driven agent there is no runtime system sitting behind the prose.
The model reads *"treat what you know as passing through six states … containment
is not deletion … inherited memory keeps its origin"* and then it reasons that
way. The behaviour **is** the prose being followed. Compiling the
memory-feedback-loop fragment into a cognitive agent's system prompt and serving
it *is* installing the memory feedback loop — not a placeholder for a later
implementation.

Two things are often conflated (see the architecture plates,
`green-agentz/docs/architecture/memory-and-monitor.md`):

| | What it is | Status |
|---|---|---|
| **Plate 5** — the six-state loop | the cognitive model itself | **in place** once `compile` runs and a cognitive agent serves it — it is prose the model executes |
| **Plate 6** — the copy-on-write record store, append-only phase-event log | durability infrastructure for records that must outlive a context or a process | not built; staged in `green-agentz/systems/green-brainz/memory/` |
| Agentz → gateway "bounded context" | the injection seam (MFL-17) | not built |

Only Plate 6 and the injection seam are "ahead of progress." Plate 5 is not
ahead of anything.

## Layers

Outermost (most general) to innermost (agent-specific), joined with a blank line
into one system message:

| Layer | File | Applies to |
|---|---|---|
| agency | `policies/frames/agency.md` | all except the nexus and the critical agents |
| memory feedback loop | `policies/frames/memory-feedback-loop.md` | the **cognitive agents** (see below) |
| confidence | `policies/frames/confidence.md` | all except the nexus and the critical agents |
| kernel | `policies/<KERNEL_BASENAME[alias]>` | every agent — verbatim, innermost |

## Which agents get which frames

**Cognitive agents** reason over a working set across turns — a set of things
admitted to attention, ranked, recalled, carried forward. The
memory-feedback-loop frame is behaviour they can actually run, so they carry it.
This is a fact about the roster, not a rollout toggle: a future agent that
reasons over a working set is a cognitive agent by definition and gets the frame.

| Alias | Frames | Why |
|---|---|---|
| `general-text-speculator` | agency + **memory** + confidence | the conversational catch-all; carries a working set across turns |
| `qwenstral-code-speculator` | agency + **memory** + confidence | holds a working set of the task, files, and schema |
| `vision-layout-agent` | agency + confidence | single-shot transducer: image → OCR, nothing recalled |
| `audio-transcription-agent` | agency + confidence | single-shot transducer: audio → text |
| `image-generation-agent` | agency + confidence | single-shot transducer: text → image |
| `tool-router-agent` (nexus) | **kernel only** | sub-perceptual router; also bound by `MICROKERNEL_MAX_CHARS` (512) and `assertNexusKernelText` |
| `safety-policy-agent` | **kernel only** | critical kernel — MFL-3: cognitive framing never rides on a security kernel |
| `security-monitor-agent` | **kernel only** | critical kernel — MFL-21: cognitive state grants no monitor authority |

The selection lives in one place, `MFL_ALIASES` / `stockPromptLayers()` in
`src/compile-prompt.mjs`.

The memory-feedback-loop fragment is the compiled prose form of
`green-agentz/docs/memory-feedback-loop-requirements.md` (MFL-1..25). It maps:
the six machine phases and their meanings (MFL phase table); coordinate-not-clock
(MFL-4); attention is bounded and cannot override policy or containment
(MFL-8/9); containment is not deletion (MFL-14); origin survives movement, a
wraparound is a new derived record (MFL-7/13); first-hand vs inherited weighting
(MFL-2, REQ-7.2); bounded deterministic recall, no bookkeeping tokens
(MFL-10/11).

## Compile

```
green-roomz compile [--manifest path] [--check]
```

Writes `build/prompts/<alias>.md` for every non-variant agent plus
`build/prompts/index.json` — a SHA-256 per frame file and per compiled agent
prompt, the agent's layer list, and its byte size. `--check` exits non-zero if
any committed artifact is stale; wire it into CI and the pre-commit path.

`compileStockPrompt(agent, { kernelText, framesDir })` in
`src/compile-prompt.mjs` is a pure function — CRLF-normalised, same inputs give
the same bytes. The kernel-text guards (`assertNexusKernelText`,
`kernelBindingIssues`) live in `src/kernel-text.mjs` so the compiler can share
them without importing `config.mjs` back.

`.gitattributes` pins `build/prompts/**` and `policies/**` to `eol=lf` so the
committed bytes and a fresh checkout match on every platform and `--check` stays
stable.

## Runtime

`injectSystemPolicy` (gateway) and `withNexusPolicy` (nexus) inject
`build/prompts/<alias>.md` when it exists and its SHA matches `index.json`;
otherwise they fall back to `loadDeclaredKernel(agent)` — the kernel file alone,
today's behaviour. A stale, missing, or tampered build never blocks serve. An
agent with a **custom** `system_policy` (not the canonical `KERNEL_BASENAME`
path) always uses that policy directly, never a committed compile of the default.

## Prime — the "default installation" checkpoint

```
green-roomz prime [--manifest path] [--only alias,alias]
```

For each primeable agent (`llama_server`, not resident, not the nexus): start it
with its compiled stock prompt as the system message, run a single token
(`n_predict: 1`, `cache_prompt: true` — needed for the primed KV to persist),
then `snapshotModel(alias, 'default')`. Result:
`<checkpoint_dir>/<alias>/default.bin` plus `default.snapshot.json`, whose
descriptor records the compiled-prompt SHA and the llama.cpp build id.

On `serve`, after a cold start, if `default.snapshot.json` exists and both its
prompt SHA and build id still match, `restoreModel` the KV — the model wakes
already holding its stock prompt instead of an empty context. A mismatch is
ignored; prime is regenerated at deploy time, not shipped.

## Where this belongs

Per the architecture (Plate 2, Plate 9): Green-Agentz owns the cognitive plane
and is the canonical source tree; Green-Roomz is its inference-runtime subsystem.
The frames and the compile step express agency-wide cognitive doctrine, so the
long-term home is **green-agentz**, emitting `build/prompts/` down into the
green-roomz subtree. It lives in green-roomz now because that is where the
prompts are served and the kernel-faith machinery already sits; moving the
fragment sources up to green-agentz is a follow-up (see `docs/TODO.md`).

## See also

- Architecture plates (rendered): https://claude.ai/code/artifact/c8af7585-7538-498f-bb1e-a7459e69e319
- `green-agentz/docs/memory-feedback-loop-requirements.md` — MFL-1..25
- memory `stock-prompt-compile-intent`
