# Fuzz review — Windows dogfood (qodesh)

Operator pass on `C:\Users\brian\Documents\green-roomz`. Did **not** git commit/push, bounce serve, download models, or edit `src/process-manager.mjs`.

Live `http://127.0.0.1:8080` and `:8187` were **not listening** this turn (`data/serve.pid` 12252 and `data/children.json` nexus pid 13868 are stale). Did not start or stop serve.

## Command

```
node --test .\test\fuzz-stress.test.mjs .\test\gateway.test.mjs
```

After adding two P0 lock-in cases: **46 tests, 42 pass, 4 fail** (same 4 gateway dirty-tree reds as before). All 11 `fuzz-stress.test.mjs` tests pass.

## Wave 1 503 re-verify (still green)

These still pass with stubbed llama / missing artifacts:

| Test | Result |
|---|---|
| `/tts on chat completions is 503 when piper is missing` | 503, alias `speech-synthesis-agent` |
| `/draw and /imagine on unavailable image-generation-agent are 503` | 503, alias `image-generation-agent` |
| `model image-generation-agent unavailable is 503 not resident 200` | 503, not resident 200 |
| `/code on an impractical specialist falls back to resident 0.5B instead of 503` | 200, alias `tool-router-agent` |
| `mixed image and audio on chat is not 400` | 200 |
| `/vision without an image is 400` | 400 (client error, not 503) |

Wave 1 contract holds: missing **native** slash (`/draw` `/imagine` `/tts`) and `model: image-generation-agent` → **503**; impractical `/code` still **200** on the resident 0.5B.

## Unrelated dirty-tree reds (5)

Not this patch. Same set as Wave 1:

1. **`pinned general-text C++ program still proxies to the code alias`** (`test/gateway.test.mjs`) — actual `general-text-speculator`, expected `qwenstral-code-speculator`. Tests still assume CODE_INTENT regex hops; `hardRuleRoute` now leaves a pinned general-text pin unless slash/lock says otherwise.
2. **`session started on general-text switches to code on a python function`** — same pin vs regex mismatch; follow-up stays on general-text.
3. **`public bind is rejected without explicit security flags`** — still throws; message is `Binding to all interfaces requires GREEN_ROOMZ_ALLOW_PUBLIC=1; prefer a specific host + gateway.allow_peers`, test still wants `/Public\/non-loopback/`.
4. **`plain follow-up after /code consults nexus instead of staying on code`** — actual `qwenstral-code-speculator`, expected `general-text-speculator`. Requested `model: qwenstral-code-speculator` is pinned; nexus is not consulted.
5. **`text-only turns do not regex C++ or image intent; nexus decides`** (`test/routing.test.mjs`, not in the two-file run) — `routeRequest` returns `qwenstral-code-speculator` / `requested_alias` because that alias is routable; test expects `null` / `nexus`.

## P0: `messages=42` still 400

**Not a gateway body-limit or message-count check.** No local validation fix.

What the gateway actually does (`src/gateway.mjs`):

- Body cap is `gateway.request_body_limit_bytes` (**16 MiB** in `config/agents.windows-mvp.json`, **1 MiB** in unit `sampleManifest`). Oversize is `ValidationError` **400** (`Request body exceeds configured limit`), not 413. 42 short turns are a few KB.
- The only `messages` shape check is: if present, it must be an array. A **number** `messages: 42` is correctly **400** (`messages must be an array`).
- There is **no** max-turn / max-messages cap, no role-alternation check, and no history truncation in `prepareInferenceBody`.
- A specialist hop that gets llama **≥400** is **forwarded as-is** (`handleChatTurn` peek path). llama.cpp documents this as HTTP 400 `the request exceeds the available context size` when prompt tokens > `--ctx-size` (MVP `context_size` 4096 via process-manager; Race owns that file). `--context-shift` is not on the launch line.

Lock-in tests added in `test/fuzz-stress.test.mjs` (both green with stubbed llama):

- `fuzz: 42-message history is not a gateway 400` — 42 alternating user/assistant turns → **200**; specialist body has `messages.length >= 42`.
- `fuzz: messages as the number 42 is validation 400, not a hang` — `{"messages":42}` → **400**.

Live 42-turn 400 was **not** re-hit this turn (serve down). If it still 400s against llama, it is **upstream context / chat-template**, not gateway validation. A real fix is bigger than this file:

- Client- or gateway-side history trim to fit `agent.context_size` (needs a tokenizer, not a magic `40`).
- Or llama `--context-shift` / larger `--ctx-size` (process-manager / manifest — out of scope here).

Do not treat llama 400 as a client JSON bug, and do not add a silent `messages.slice(-N)` without a token budget.

## Instruct speculator (WINDOWS-MVP)

`WINDOWS-MVP.md` wants **Qwen2.5-0.5B-Instruct** as `general-text-speculator` (CPU mmap, not the 8600 GT).

`config/agents.windows-mvp.json`:

- alias `general-text-speculator`
- `model`: `${GRZ_ROOT}/models/Qwen2.5-0.5B-Instruct-Q4_K_M.gguf`
- artifact: `bartowski/Qwen2.5-0.5B-Instruct-GGUF` / `Qwen2.5-0.5B-Instruct-Q4_K_M.gguf`, `approx_bytes` 397808192
- nexus `tool-router-agent` stays `Qwenstral-Small-3.1-0.5B.Q4_K_M.gguf` (router only)

On disk (did **not** download):

| Path | Status |
|---|---|
| `C:\Users\brian\Documents\green-roomz\models\Qwen2.5-0.5B-Instruct-Q4_K_M.gguf` | **present**, 397808192 bytes (2026-09-06) |
| `C:\Users\brian\Documents\green-roomz\models\Qwenstral-Small-3.1-0.5B.Q4_K_M.gguf` | **present**, 460616064 bytes |
| `C:\LocalAI\Qwen2.5-0.5B-Instruct-Q4_K_M.gguf` | **missing** (LocalAI has coder 1.5B/7B Instruct, VL-3B Instruct, Qwenstral 0.5B — not this chat Instruct) |

MVP chat alias is wired and the GGUF is in-tree under `models\`. Serve was down so health/availability was not live-checked.

## Modality notes (this pass)

- Mixed image+audio: not 400 (nexus, both parts in AVAILABLE).
- `/vision` with no image part: 400.
- Missing image-gen / piper: 503 with `x-green-roomz-effective-alias` set to that specialist.
- Impractical code: 200 resident fallback (not 503).
- Fuzz corpus: no 500, hang, or header injection; oversized body 400/413 then `/v1/health` still 200.

## Leftover

- Live 42-turn POST against `:8080` once serve is up (confirm llama 400 body is `exceeds the available context size` vs something else).
- Dirty-tree intent/pin/public-bind tests need their owners; fuzz did not retune them.
- `policies/frames/` is absent; `compileStockPrompt` falls back to kernel text only.
