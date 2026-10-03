# DISPATCH-FIX-01 — Silent model fallthrough → reject/503

**Date:** 2026-09-12  
**Owner:** Release Driver (executor)  
**Scope:** P0 dispatch fix #1 from `DISPATCH-BUGS-2026-09-12.md`  
**Tree:** `/workspace/grz-src` (box snapshot; no git clone, no push, no reboot)  
**Baseline note:** Live qodesh fuzz still open before this box patch; do not invent SHAs for a land that is box-only until bounced on qodesh.

---

## Bug (before)

Explicit client `model` pins that were **unknown** or **known-but-unavailable** were absorbed by nexus and answered as **`tool-router-agent` with HTTP 200**.

| Repro (defensive) | Before |
|-------------------|--------|
| `model: speech-synthesis-agent` | 200 `eff=tool-router-agent` (FUZZ-FALLTHROUGH-model_tts) |
| `model: code-agent` (unknown) | 200 tool-router (FUZZ-FALLTHROUGH-model_code) |
| `model: general-text-agent` (typo; real is `general-text-speculator`) | 200 tool-router (FUZZ-FALLTHROUGH-model_general_text) |
| `model: image-generation-agent` when missing | **503** (FUZZ-DRAW-503) — must preserve |

Root cause in `hardRuleRoute`: only modality, slash, and `lock_alias:true` pinned; plain `body.model` fell through to `reason: nexus`. `isRouterSentinel` also treated **unknown** aliases as sentinels (auto-equivalent), which would have reinforced absorption if callers used it.

---

## What changed (files)

| File | Change |
|------|--------|
| `/workspace/grz-src/routing.mjs` | Added `isAutoModelId`, **`resolveExplicitModelPin`** (pure policy); wired into `hardRuleRoute`; `isRouterSentinel` no longer treats unknown as sentinel |
| `/workspace/grz-src/errors.mjs` | Added (copied from session tree) — already imported by routing/gateway; required for unit import |
| `/workspace/grz-src/constants.mjs` | Added (copied from session tree) — already imported; required for unit import |
| `/workspace/grz-src/test/resolve-explicit-model-pin.test.mjs` | `node:test` coverage for policy + hardRuleRoute + 503 mapping |
| `/workspace/reviews/release/dispatch-fix/resolve-explicit-model-pin.test.mjs` | Same tests (import path to grz-src) |
| `gateway.mjs` / `nexus.mjs` / `handoff.mjs` | **Unchanged** — first-hop already `throw UnavailableError` when `hard.effectiveAlias` is not routable |

### Policy (`resolveExplicitModelPin`)

1. `auto` / `tool-router-agent` / empty / compat ids (`gpt-4o`, …) → **`nexus`** (intentional `/auto` path intact; slash `/auto` still short-circuits first).
2. Alias **not** in registry → **`ValidationError` 400** with `{ allowed: [...] }`.
3. Alias known + **unavailable** → **`pin`** (`requested_alias` / `lock_alias`) so gateway first hop returns **503 `agent_unavailable`** (same pattern as image-gen).
4. Alias known + available + `lock_alias: true` → **pin**.
5. Alias known + available + no lock → **nexus** (llama.app sticky last-alias ignore preserved).

---

## Behavior after

| Client `model` | After |
|----------------|-------|
| `code-agent` / `general-text-agent` | **400** `validation_error` — never 200 tool-router |
| `speech-synthesis-agent` (unavailable) | **pin** → completions **503** `agent_unavailable` |
| `image-generation-agent` (unavailable) | **pin** → **503** (preserved) |
| `auto` / `tool-router-agent` / `/auto …` | **nexus** routing unchanged |
| available specialist without `lock_alias` | nexus (sticky ignore) |

Gateway path already present in `handleChatTurn`:

```text
if (hops.length === 0 && hard.effectiveAlias && !isRoutableAlias(...))
  → UnavailableError 503
```

---

## How to verify on qodesh localhost

Gateway assumed at `http://127.0.0.1:8080` after this patch is copied/bounced into the live tree (box tree alone does not change the Windows serve).

```bash
# Unknown → expect HTTP 400, not 200 tool-router
curl -sS -D- -o /tmp/out.json -X POST http://127.0.0.1:8080/v1/chat/completions \
  -H 'content-type: application/json' \
  -d '{"model":"code-agent","messages":[{"role":"user","content":"hi"}],"max_tokens":8}'
# check status 400; body type validation_error

# Wrong general-text typo → 400
curl -sS -D- -o /tmp/out.json -X POST http://127.0.0.1:8080/v1/chat/completions \
  -H 'content-type: application/json' \
  -d '{"model":"general-text-agent","messages":[{"role":"user","content":"hi"}],"max_tokens":8}'

# TTS pin when specialist missing → 503 agent_unavailable (not 200 tool-router)
curl -sS -D- -o /tmp/out.json -X POST http://127.0.0.1:8080/v1/chat/completions \
  -H 'content-type: application/json' \
  -d '{"model":"speech-synthesis-agent","messages":[{"role":"user","content":"say hi"}],"max_tokens":8}'
# expect 503; x-green-roomz-effective-alias=speech-synthesis-agent (or error details)

# Image-gen missing still 503
curl -sS -D- -o /tmp/out.json -X POST http://127.0.0.1:8080/v1/chat/completions \
  -H 'content-type: application/json' \
  -d '{"model":"image-generation-agent","messages":[{"role":"user","content":"a red apple"}],"max_tokens":8}'

# Intentional auto still nexus (200 path, not 400)
curl -sS -D- -o /tmp/out.json -X POST http://127.0.0.1:8080/v1/chat/completions \
  -H 'content-type: application/json' \
  -d '{"model":"auto","messages":[{"role":"user","content":"hello"}],"max_tokens":8}'
```

Offline unit verify (box):

```bash
node --test /workspace/grz-src/test/resolve-explicit-model-pin.test.mjs
# expect: 15 pass, 0 fail
```

---

## Test result (this pass)

```
node --test /workspace/grz-src/test/resolve-explicit-model-pin.test.mjs
→ 15 pass / 0 fail
```

No `package.json` under `/workspace/grz-src` (no npm test script). Session tree `green-roomz` has `"test": "node --test"` but was **not** run as a full suite (out of scope / different tree revision).

---

## Residual risk / open items

1. **Not bounced on live qodesh yet** — box `/workspace/grz-src` only; operator must copy + restart serve to clear FUZZ-FALLTHROUGH-* on :8080.
2. **Available specialist without `lock_alias` still nexus** — intentional llama.app sticky ignore. If TTS (or another specialist) is **ready** and client pins it without lock, router may still answer; fuzz cases were unavailable/unknown. Tighten later if product wants “any explicit known pin always routes.”
3. **`/route` plan for unavailable pin returns 200 with intended alias** — completions 503; plan endpoint advertises the pin rather than absorbing tool-router. Confirm product preference.
4. **Slash modality / TTS 500 / null-body hang / vision-first prettify** — other DISPATCH-BUGS items; out of scope for fix #1.
5. **Full gateway HTTP harness** not run here (missing process/registry stack in grz-src snapshot).

---

## Explicit non-actions

- No `git clone`, no push, no reboot, no invented land SHAs.
