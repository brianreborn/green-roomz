# Stock system-prompt compilation

The system prompt each agent runs is **compiled** from layered fragments and
committed to the repo. Requirements become prose the model reads, not code; the
compiled prompt requires nothing more complicated than being a system prompt.

## Layers

Outermost (most general) to innermost (agent-specific):

| Layer | File | Applies to |
|---|---|---|
| agency | `policies/frames/agency.md` | all except nexus, safety, monitor |
| memory feedback loop | `policies/frames/memory-feedback-loop.md` | `general-text-speculator` (widens once proven) |
| confidence | `policies/frames/confidence.md` | all except nexus, safety, monitor |
| kernel | `policies/<KERNEL_BASENAME[alias]>` | every agent (verbatim, innermost) |

The **nexus** (`tool-router-agent`) compiles to its kernel alone — it must stay
under `MICROKERNEL_MAX_CHARS` and carry no critical rules
(`assertNexusKernelText`). The **critical** agents (`safety-policy-agent`,
`security-monitor-agent`) also compile to their kernel alone: MFL-3 and MFL-21 —
cognitive framing never rides on the security kernels.

The memory-feedback-loop fragment is the compiled form of
`green-agentz/docs/memory-feedback-loop-requirements.md` (MFL-1..25). See the
memory `stock-prompt-compile-intent`.

## Compile

```
green-roomz compile [--manifest path] [--check]
```

Writes `build/prompts/<alias>.md` for every agent plus `build/prompts/index.json`
(a SHA-256 per alias over the compiled text + the fragment set). `--check` exits
non-zero if any committed artifact is stale — wire it into CI and the pre-commit
path. The artifacts are committed; they are the reviewable output.

`compileStockPrompt(agent, { framesDir, kernelText })` in `src/compile-prompt.mjs`
is a pure function — same inputs, same bytes.

## Runtime

`injectSystemPolicy` / `withNexusPolicy` inject `build/prompts/<alias>.md` when it
exists and its `index.json` digest matches the live fragments; otherwise they
fall back to `loadDeclaredKernel(agent)` (the kernel file alone, unchanged
behaviour). A stale or missing build never blocks serve.

## Prime — the "default installation" checkpoint

```
green-roomz prime [--manifest path] [--only alias,alias]
```

For each primeable agent (llama_server, non-resident-or-nexus): start it with its
compiled stock prompt as the system message, run a single token
(`n_predict: 1`, `cache_prompt: true` — needed for the primed KV to stick), then
`snapshotModel(alias, 'default')`. Result: `<checkpoint_dir>/<alias>/default.bin`
plus `default.snapshot.json`, whose descriptor records the compiled-prompt digest
and the llama.cpp build id.

On `serve`, after a cold start, if `default.snapshot.json` exists and both its
prompt digest and build id still match, `restoreModel` the KV — the model wakes
already holding its stock prompt instead of an empty context. A mismatch is
ignored (prime is regenerated at deploy time, not shipped).
