# MVP stream:true SSE fix (parity case E)

**When:** 2026-09-06 ~08:52–09:05 AM PT  
**Tree:** `/workspace/green-roomz`  
**Constraint:** no box `:8080`/`:8187` bounce; no GGUF on GPU; no git push; local commit OK.  
**qodesh:** not connected this session (`ListMachines` empty) — live re-verify deferred.

---

## Root cause

On windows-mvp, chat often routes `general-text-speculator` → **`resident_fallback`** → warm **`tool-router-agent`** (nexus on `:8187`).

`Gateway.completeOnResident` forced:

```js
const payload = { ...prepareInferenceBody(body, agent), stream: false };
```

So even when the client sent OpenAI-compatible `stream: true`, the gateway:

1. Stripped streaming from the upstream llama hop.
2. Went through `proxyJson` non-stream path.
3. Returned `content-type: application/json` one-shot `chat.completion` — **no** SSE `data:` lines.

Battery case E saw exactly that (`x-green-roomz-route-reason: resident_fallback`).

**Not** Accept-header stripping, **not** nexus consult (`consultNexus` correctly uses `stream: false` for JSON route picks), **not** `proxy.writeSanitizedSse` itself — those paths already stream when `body.stream === true`.

---

## Fix

**File:** `src/gateway.mjs` — `completeOnResident`

- Honor client stream preference via `prepareInferenceBody(body, agent)` (preserves `stream`).
- Do **not** force `stream: false` on the user-facing resident answer path.
- Council / nexus-consult / judge hops keep their intentional `stream: false`.

**Test:** `test/gateway.test.mjs`

- `rawRequest` helper (SSE body as text).
- New case: `resident_fallback honors stream:true with SSE data: chunks` — asserts `text/event-stream`, `data:` / content, `resident_fallback` headers, and upstream payload keeps `stream: true`.

Unit: `node --test --test-name-pattern='resident|stream|fallback|cold specialist' test/gateway.test.mjs test/proxy.test.mjs` → **10 pass / 0 fail**.

---

## qodesh re-verify (when machine connected)

1. `CopyFromBox` into `C:\Users\brian\Documents\green-roomz`:
   - `src\gateway.mjs`
   - `test\gateway.test.mjs` (optional on Windows)
2. PF-aware bounce: `stop.cmd` then `scripts\start-windows-mvp.cmd` (quoted `GRZ_LLAMA` / `GRZ_MANIFEST`). Wait for `:8080` + pre-warm `:8187`.
3. Case E only, e.g.:

```bat
curl.exe -sN -D - -H "Content-Type: application/json" -H "Accept: text/event-stream" ^
  -d "{\"model\":\"general-text-speculator\",\"stream\":true,\"max_tokens\":32,\"messages\":[{\"role\":\"user\",\"content\":\"Say hi in five words\"}]}" ^
  http://127.0.0.1:8080/v1/chat/completions
```

Expect: `content-type: text/event-stream`, one or more `data:` lines (may still be `effective-alias: tool-router-agent` via `resident_fallback` — that is OK for surface).

Or: `scripts\mvp-parity-battery.cmd` and confirm case E PASS.

---

## Parity board

Case E: **FIXED in gateway (unit-verified)**; **live qodesh re-verify pending** (machine offline). See update in `qodesh-mvp-parity-battery.md`.

---

## Box verify after a6be0f9 (2026-09-06 ~08:57 AM PT)

**Verdict: PASS**

| Check | Result |
|-------|--------|
| Commit | `a6be0f9` present on `/workspace/green-roomz` (`fix(gateway): honor stream:true on resident_fallback SSE path`) |
| Live `:8080` | **old tree** — cwd `/workspace/e2e-fresh/green-roomz`, still forces `stream: false` in `completeOnResident` → **did not** curl case E against it |
| Live `:8187` | left running (llama-server); untouched |
| Unit | `node --test --test-name-pattern='resident_fallback honors stream' test/gateway.test.mjs` → **1 pass / 0 fail** |
| Ephemeral serve | `:18080` via `scripts/_ephemeral-stream-check.mjs` — tiny `sampleManifest`, stubEnsure, mock upstream SSE; **no GGUF / no GPU** |
| Curl case E on `:18080` | **PASS** — `content-type: text/event-stream`, `data:` lines (`hi-stream` + `[DONE]`), `x-green-roomz-route-reason: resident_fallback`, `effective-alias: tool-router-agent`, upstream payload kept `stream: true` |

Curl excerpt (headers + body):

```
HTTP/1.1 200 OK
x-green-roomz-effective-alias: tool-router-agent
x-green-roomz-route-reason: resident_fallback
content-type: text/event-stream

data: {"choices":[{"delta":{"content":"hi-stream"}}]}

data: [DONE]
```

Live qodesh re-verify still pending (machine offline); box-side stream surface after a6be0f9 is confirmed.

---

## Box live re-verify (2026-09-06 ~08:55–08:57 AM PT)

**Commit:** `a6be0f9` (`fix(gateway): honor stream:true on resident_fallback SSE path`) on `/workspace/green-roomz`.

**Live `:8080`/`:8187`:** left untouched. `:8080` is `node` from `/workspace/e2e-fresh/green-roomz` (pre-fix tree still forces `stream: false` in `completeOnResident`); `:8187` is existing `llama-server`. Did **not** curl case E against live 8080.

**Unit (reconfirmed):**
```
node --test --test-name-pattern='resident_fallback honors stream' test/gateway.test.mjs
→ 1 pass / 0 fail (`resident_fallback honors stream:true with SSE data: chunks`)
```

**Ephemeral serve (no GGUF / no GPU):** `scripts/_ephemeral-stream-check.mjs` — Gateway + stubbed `ensure` + mock upstream on `127.0.0.1:18080`, tiny `sampleManifest`, then async `curl` case E:

```bash
curl -sN -D - -H 'Content-Type: application/json' -H 'Accept: text/event-stream' \
  -d '{"model":"general-text-speculator","stream":true,"max_tokens":32,"messages":[{"role":"user","content":"Say hi in five words"}]}' \
  http://127.0.0.1:18080/v1/chat/completions
```

**Observed:**
- `HTTP/1.1 200`
- `content-type: text/event-stream`
- `x-green-roomz-route-reason: resident_fallback`
- `x-green-roomz-effective-alias: tool-router-agent`
- body: `data: {"choices":[{"delta":{"content":"hi-stream"}}]}` + `data: [DONE]`
- upstream payload kept `stream: true`

**Ports after teardown:** only original `:8080` + `:8187` still listening; `:18080` gone.

### Result: **PASS**
