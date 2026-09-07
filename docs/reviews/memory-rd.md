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

Install keys (no silent defaults): `memory_transcript_chars`, `memory_facts_limit` in `config/agents.windows-mvp.json`, `config/agents.android.json`, `validateManifest`, `ORCHESTRATOR_BOUNDED_KEYS`.

## Tests run

```
node --test test/sessions.test.mjs test/session-memory.test.mjs test/memory.test.mjs test/gateway.test.mjs
```

68 pass / 0 fail (includes RAM admission, two-turn Ada inject, ctx clip, gateway hop wiring). `test/config.test.mjs` also green for the new install keys.

## Remaining backlog

- **Plate 6** durable CoW store (`GREEN_BRAINZ_ROOT` / `src/brainz.mjs`) — optional, out of this slice.
- Assistant text is recorded on peek-keep; streamed `proxyJson` chat_default does not tap the SSE, so only the user turn is stored unless the client resends history.
- `config/agents.windows.json` is mid-merge; parent must add the two memory keys when landing.
- No tokenizer; clip is character-budget. A real token count can replace `CHARS_PER_TOKEN` later.
- Containment / partition states stay prompt-prose (Plate 5); this seam only injects the admitted working set.
