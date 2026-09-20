# Memory R&D (qodesh, 2026-09-07)

Worker: Green-Roomz MEMORY SYSTEM R&D. Host: qodesh. No GGUF load, no CUDA, no live 16-case battery.

## What was already landed

1. **Host RAM admission** (`src/memory.mjs`) — `profileAdmitted` / `admit_when_tight`. Left alone.
2. **Plate 5 stock-prompt MFL** — `policies/frames/memory-feedback-loop.md` compiled into cognitive agents (`compileStockPrompt`). Prose the model reads; not a store.
3. **Session ledger** — identity, TTL, last alias, slash `/faith` `/fear` `/yolo`. Did not persist a working set or feed it back.

`docs/stock-prompts.md` named the gap: **MFL-17 bounded-context injection seam — not built.**

## What this pass implemented

In-process conversational memory on the existing `SessionLedger` (no parallel store, no dreamcatcher, no GGUF).

| Piece | Where |
|---|---|
| Compact working set | `facts[]`, `transcript[]`, `lastSpecialist` on each session row |
| Clip / format / inject | `src/session-memory.mjs` |
| Remember + copy-out | `SessionLedger.rememberTurn` / `workingSet` |
| Next-turn inject + ctx clip | `prepareInferenceBody(..., { session })` and `Gateway.prepareTurn` |
| Observable | response header `x-green-roomz-memory: facts=N;chars=N;specialist=alias` |

Budget: stored transcript is `gateway.memory_transcript_chars` (MVP **2048**). Live prompt clip is `agent.context_size` (Athlon **4096**) with a 4 chars/token estimate — not a silent `slice(-N)`.

Install keys (no silent defaults): `memory_transcript_chars`, `memory_facts_limit` in `config/agents.windows-mvp.json`, `config/agents.android.json`, `config/agents.windows.json`, `validateManifest`, `ORCHESTRATOR_BOUNDED_KEYS`.

## Continuation (this pass)

1. **SSE / JSON assistant capture.** `proxyJson` returns `{ status, content }` for both JSON completions and SSE delta streams. Gateway `recordProxy` writes that into `SessionLedger` on `chat_default`, text fallback, resident, direct-alias, and peek-timeout retry. `scripts/chat-mvp.cmd` stream:true is no longer user-only.
2. **windows.json keys.** `memory_transcript_chars` / `memory_facts_limit` added.
3. **Append-only jsonl.** `SessionLedger({ persistDir })` writes `data/sessions/<uuid>.jsonl` (latest line wins on reload). Serve wires `persistDir` to `<packageRoot>/data/sessions`. Tests use a temp dir. Not GREEN_BRAINZ_ROOT / not a new GGUF.
4. **Clip tests tightened.** Oldest dropped, oversize turn tail-clipped to the exact bound, `clipMessages` keeps system + newest user under budget.

## Tests run

```
node --test test/session-memory.test.mjs test/sessions.test.mjs test/gateway.test.mjs
```

Also `test/proxy.test.mjs` this pass. Combined: **75 pass / 0 fail**.

## Remaining

- Plate 6 `GREEN_BRAINZ_ROOT` CoW is still optional and unused.
- Clip is still a character budget (`CHARS_PER_TOKEN = 4`), not a tokenizer.
- Containment / partition stay prompt-prose.
