# P0 patch sketch — SSE transform + widened ESC/invisible strip

**Owner:** Covert Channel Fixer  
**Freeze gate:** land before image freeze (OFFLINE-SECURITY-WORKSTATION-PLAN §5)  
**Trees:** session `/workspace/session/green-roomz` (canonical); port helpers from `/workspace/grz-src`  
**Rules:** defensive only; no exploit how-to; no git push

## Problem (leak only)

| Site | Leak | To whom |
|------|------|---------|
| `src/proxy.mjs:68-84` | `stream:true` → raw `Readable.pipe` — no `sanitizeCompletionJson` | HTTP client |
| `src/handoff.mjs:311-328` | Peek events sanitized; SSE tail `response.write(value)` / carry raw | HTTP client |
| `src/proxy.mjs:23-47` | Deletes `timings` only; does not strip invisible/ESC from `content`/`delta` | HTTP client |
| session `util.mjs` | No `stripControls`/`headerSafe` (grz-src has C0/C1 only) | HTTP client / nexus notes |

## Patch (behavior change)

### 1. `util.mjs` — widen strip

Port grz-src `stripControls` / `headerSafe`, then extend:

```js
// stripInvisibleAndEsc(text): defensive filter only
// - C0/C1 (as grz-src)
// - Cf invisibles: U+200B–U+200F, U+202A–U+202E, U+2060–U+206F, U+FEFF, U+E0000–U+E007F (tags)
// - ANSI/OSC/CSI sequences: ESC [ ... / ESC ] ... BEL|ST
export function stripInvisibleAndEsc(value) { /* ... */ }
export function stripControls(value) { /* keep grz-src name; call widened impl */ }
export function headerSafe(value) { return stripControls(value).slice(0, 240); }
```

### 2. `proxy.mjs` — `sanitizeCompletionJson`

- Keep `delete next.timings`
- Also drop or zero `usage` (at least `prompt_tokens_details.cached_tokens`) for client responses — match freeze preference: **drop `timings`; zero `cached_tokens`**
- For each `choices[].message.content` and `choices[].delta.content` (and reasoning fields when kept): run `stripInvisibleAndEsc`
- Export `sanitizeSseDataLine(line)` → parse `data: {...}` JSON when possible → `sanitizeCompletionJson` → re-encode; pass through `[DONE]` / non-JSON comments unchanged

### 3. `proxy.mjs` — ban raw stream pipe

Replace `Readable.fromWeb(upstream.body).pipe(response)` with a Transform that:

1. Buffers SSE by `\n\n` event boundaries
2. Runs each `data:` payload through `sanitizeSseDataLine`
3. Never forwards unsanitized bytes

Non-SSE upstream (rare): buffer + attempt JSON sanitize, else reject/empty with 502 — **do not** raw-pipe.

### 4. `handoff.mjs` — `deliverPeek` live tail

Replace `response.write(Buffer.from(value))` and carry flush with:

- Feed chunks into existing SSE parser (or shared transform)
- `writeSse(response, sanitizeCompletionJson(event.json, …))` only
- On end: sanitize leftover carry the same way; never write raw carry

### 5. Headers (same freeze cut if cheap)

Apply `headerSafe` to `x-green-roomz-*` / `x-session-id` in `gateway.mjs` setHeader sites (`:213-221`, `:395-397`).

## Tests (safe behavior only)

| Test | Assert |
|------|--------|
| `proxy` stream fake SSE with `"timings":{...}` in a chunk | Client body has no `"timings"` key |
| content `'ok\u200b\ufeff'` + ANSI color wrapper | Sanitized equals `'ok'` |
| `deliverPeek` live tail chunk with timings + zwsp | Same two asserts |
| non-stream path regression | Existing timings strip tests still pass |
| `headerSafe` on reason with C0 | Header value has no control bytes |

## Out of scope this cut

Latency buckets, mailbox envelopes, media MIME gate, `--poll 0`, CPU affinity (later priorities on fix-pack board).

## Hand-off

Release Driver / integrate: apply to session tree; run `node --test test/proxy.test.mjs test/gateway.test.mjs` (+ new cases).  
@Covert Channel Reviewer: re-check file:line after land.
