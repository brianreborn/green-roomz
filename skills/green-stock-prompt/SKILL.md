---
name: green-stock-prompt
description: Compile, inspect, and tune the layered "stock" system prompts Green-Roomz agents run — the agency / memory-feedback-loop / confidence frames plus each agent kernel. Triggers include green-stock-prompt, compile the system prompts, stock prompt, macrokernel, add the memory frame, cognitive agent prompt, try the memory feedback loop, prime the default installation, build/prompts is stale.
metadata:
  type: workflow
  version: "1.0"
---

# Green Stock Prompt

The system prompt each agent runs is **compiled** from layered fragments and
committed under `build/prompts/`. `green-roomz compile` is the build; the git
diff of `build/prompts/` is the record of what changed in an agent's doctrine.

For a prompt-driven agent the prose *is* the implementation: compiling the
memory-feedback-loop fragment into a cognitive agent's prompt and serving it is
installing the memory feedback loop, not a placeholder for one.

Background: [`docs/stock-prompts.md`](../../docs/stock-prompts.md) ·
architecture plates <https://claude.ai/code/artifact/c8af7585-7538-498f-bb1e-a7459e69e319>

## Layers

Joined outermost → innermost into one system message:

| Layer | File | Applies to |
|---|---|---|
| agency | `policies/frames/agency.md` | all but the nexus and the critical agents |
| memory feedback loop | `policies/frames/memory-feedback-loop.md` | the **cognitive agents** only |
| confidence | `policies/frames/confidence.md` | all but the nexus and the critical agents |
| handoff | `policies/frames/handoff.md` | code + the three transducers (narrow-job) |
| kernel | `policies/<KERNEL_BASENAME[alias]>` | every agent, verbatim, innermost |

**Cognitive agents** reason over a working set across turns, so the memory frame
is behaviour they can run: `general-text-speculator`, `qwenstral-code-speculator`.
Single-shot transducers (`vision-layout-agent`, `audio-transcription-agent`,
`image-generation-agent`) carry agency + confidence + handoff. The nexus
(`tool-router-agent`, 512-char bound) and the critical kernels
(`safety-policy-agent`, `security-monitor-agent`) get their kernel alone.
Selection: `MFL_ALIASES` / `HANDOFF_ALIASES` / `stockPromptLayers()` in
`src/compile-prompt.mjs`.

## Procedure

1. **Compile.** From the repo root:
   ```
   node bin/green-roomz.mjs compile
   ```
   Prints one line per agent — byte size and layer list — and writes
   `build/prompts/<alias>.md` + `build/prompts/index.json` (a SHA-256 per frame
   and per compiled prompt).

2. **Read what an agent actually runs.**
   ```
   cat build/prompts/general-text-speculator.md
   ```
   The nexus / safety / monitor files are their kernel verbatim (CRLF → LF).

3. **Tune the frame selection.** One place — `MFL_ALIASES` in
   `src/compile-prompt.mjs`. Add an alias to give it the memory frame; remove one
   to take it away. Then recompile and review the diff:
   ```
   node bin/green-roomz.mjs compile && git diff build/prompts/
   ```
   Only widen to an agent that genuinely reasons over a working set — the frame
   is token cost with no reachable behaviour for a pure transducer.

4. **Edit a frame, or add one.** Frame files are plain Markdown in
   `policies/frames/`. `references/example-frame.md` here is a ready "Brevity"
   layer — copy it to `policies/frames/brevity.md`, add `brevity` to
   `FRAME_NAMES` and to the list `stockPromptLayers()` returns for the target
   aliases, then recompile. Keep the nexus path empty — its compiled prompt must
   stay under `MICROKERNEL_MAX_CHARS` and clear of the critical markers
   (`assertNexusKernelText` enforces both).

5. **Verify freshness (CI / pre-commit).**
   ```
   node bin/green-roomz.mjs compile --check
   ```
   Exits non-zero and names the stale artifacts if `build/prompts/` is behind the
   frames or kernels. Commit the regenerated `build/prompts/` with the change.

6. **Run it.** `serve` compiles each agent's prompt fresh in-process (kernel +
   `policies/frames/`), so an edited frame takes effect on the next serve with no
   rebuild. `build/prompts/` is the committed snapshot, not read at runtime. If
   the frames dir is missing the injector falls back to the raw kernel.
   Inspect the live injection:
   ```
   node --input-type=module -e "import {loadManifest} from './src/config.mjs'; import {prepareInferenceBody} from './src/gateway.mjs'; const m=await loadManifest(); for (const a of m.agents.filter(x=>!x.variant_of)) { const b=prepareInferenceBody({messages:[{role:'user',content:'hi'}]},a); const s=b.messages[0]?.content||'(none)'; console.log(a.alias.padEnd(28), (s.match(/^# .+\$/gm)||[]).join(' | ')); }"
   ```

7. **Prime the "default installation" (optional).** Needs a checkpoint dir
   (`gateway.checkpoint_dir` or `GREEN_ROOMZ_CHECKPOINT_DIR`) and a runnable
   llama-server for each target.
   ```
   GREEN_ROOMZ_CHECKPOINT_DIR=./data/checkpoints \
     node bin/green-roomz.mjs prime --only general-text-speculator,qwenstral-code-speculator
   ```
   Starts each agent with its compiled prompt, runs one token
   (`max_tokens: 1`, `cache_prompt: true`), snapshots the KV as
   `<dir>/<alias_>/default.bin` + `default.snapshot.json` (records `prime.promptSha`,
   the runtime command, and the model path), then stops it. `serve` restores it
   on cold start when the prompt SHA, model, and binary all still match — the
   model wakes holding its stock prompt, not an empty context. Regenerate at
   deploy time; do not ship the `.bin`.

## Try it — the smallest loop

```
node bin/green-roomz.mjs compile
cat build/prompts/qwenstral-code-speculator.md          # code agent: has the memory frame
# remove 'qwenstral-code-speculator' from MFL_ALIASES in src/compile-prompt.mjs
node bin/green-roomz.mjs compile
git diff build/prompts/qwenstral-code-speculator.md     # the memory frame drops out
git checkout src/compile-prompt.mjs build/prompts/      # put it back
```

## Checks

- `compile --check` is green.
- `build/prompts/tool-router-agent.md` is byte-identical to
  `policies/tool-router.md` (modulo EOL) and ≤ 512 bytes.
- `build/prompts/{safety-policy-agent,security-monitor-agent}.md` carry no
  agency / memory / confidence text.
- `node --test test/compile-prompt.test.mjs` passes.
