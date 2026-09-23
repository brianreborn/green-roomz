# Goals

Read this file first. `main` does not have this work. The branch is `disclosure-acceptance` (PR 25). Checkout steps are in `docs/FAST-DOGFOOD.md`.

## Standing rules

- Do not merge PR 25 unless Brian says merge.
- Do not install or wrap `max-headroom-grok`. It cannot be secured. It is not the token compressor.
- Do not copy Brainz into this repo. `scripts/with-fleet.ps1` (or `with-fleet.sh`) clones `green-agentz` beside it. Set `GREEN_BRAINZ_ROOT` to `green-agentz/systems/green-brainz`. Skills live in `green-agentz/skills`.
- `green-agency` is a retired name. Do not open new work there.
- Token compression we own is the Memory Feedback Loop in green-agentz: nap, impress, the `green-dreamz` drive, then a new Roomz generation with bounded recall. GDICT does not compress prose. `src/memory.mjs` only decides whether weights fit in RAM.
- This Athlon II X2 (qodesh) generates at about 1.6 tokens/second on one thread with the GPU off. Dogfood the model on a faster machine. Use this box to edit and push.

## Where we stopped

- Disclosure for issues 20–23 is on this branch: `/v1/weights`, GGUF identity on `/v1/models`, OpenAI logprobs, introspection answered from the registry. See `docs/introspection.md`.
- `node bin/green-roomz.mjs dogfood --goal "..."` asks the local gateway for one unified diff. Dry-run unless `GRZ_DOGFOOD_APPLY=1`. Recreating an existing file is refused.
- A locked alias streams straight through. `dogfood: true` skips the stock prompt so the model is not told to hand off.
- Windows UAT passed 8/8 against a warm gateway on this Athlon. The first cold stream used to die at five minutes with no headers; a locked stream now writes `: open` first.
- Instruct on this CPU: about 1.6–1.9 tok/s after the weights are resident. A 100-token prompt is about a minute of prefill. `--parallel 1` means a client that gives up still occupies the slot until generation ends.
- Note 9 (`27841130ae1c7ece`) still runs an older tree. Sources were unpacked to `/data/local/tmp/grz/green-roomz`. Termux refused `RUN_COMMAND`, so `GET /` and `GET /unicorn` are still 404 there. Chat on the phone did answer. Do not restart that process unless the goal says so.

## Next goals, in order

1. On a fast machine, fresh clone, `disclosure-acceptance`, run `scripts/with-fleet.ps1` or `with-fleet.sh`, serve, and complete one dry-run `dogfood` that prints a unified diff. Record wall time, prompt tokens, and tokens/second.
2. If that diff is a real edit to one existing file, apply it with `GRZ_DOGFOOD_APPLY=1` only after `node --test` on the tests that cover the touch would pass. If the model emits a new-file diff over an existing path, reject it and tighten the prompt or the parser. Do not clobber the file.
3. Cut prefill on that machine: one thread is the Athlon profile (`cpu-1` in `config/agents.windows-mvp.json`). On a box with more cores, stop forcing `--threads 1` for the alias you dogfood. Measure before and after.
4. [x] When `GREEN_BRAINZ_ROOT` is set, one chat turn must impress through Brainz and the next turn must recall from that store, not from a pasted transcript. Roomz already loads Brainz only when the variable is set (`src/brainz.mjs`). Verified in `test/brainz-import.test.mjs`.
5. Leave Note 9 and Headroom until goals 1-3 (fast-machine dogfooding) are done. (Note: PR 25 has already been merged into `main`).

## Prompt that points here

```text
Open https://github.com/brianreborn/green-roomz, check out disclosure-acceptance, read GOALS.md, and do the next unchecked goal. Do not merge.
```
