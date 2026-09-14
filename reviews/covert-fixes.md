# Covert-channel defenses — Green-Roomz

Date: 2026-09-03. Tree: `/workspace/green-roomz`. **Pass 3 binds** `/workspace/reviews/integrate-refinement.md` and `/workspace/reviews/covert-pass3.md`. Do not fork. No git push. **Do not patch `src/`.**

Defense-only. Tests assert constants, stripping, and refusals. Do not add payloads, encoders, or recovery checks.

## Surface (as shipped)

| Target | Today | Hook |
|---|---|---|
| Timing | `sanitizeCompletionJson` drops `timings` (`src/proxy.mjs:30`). Stream path skips sanitize (`proxy.mjs:80`). SSE in `handoff.mjs` flushes as tokens arrive. `Mailbox.push` stamps `Date.now()` (`mailbox.mjs:115`). Health `uptime_ms` is continuous (`gateway.mjs:423`). | `src/timing-quant.mjs` (new); call from proxy/handoff/mailbox |
| Mailbox size | Variable `payload` until 256 chars then sha256 (`mailbox.mjs:31-38`). `stats()` exports `size/pushed/dropped` (`mailbox.mjs:89-98`). `/health` and `/v1/monitor/recent` return those (`gateway.mjs:359-365, 426`). `packSlot` is 16 bytes seq+ticket only (`monitor/ids.mjs:7,97-106`). | `clonePayload` + `publicStats` + pack full envelope |
| `cache_prompt` | Client body is forwarded almost whole (`prepareInferenceBody`, `gateway.mjs:176-191`). Prime sets `cache_prompt: true` (`bin/green-roomz.mjs:280`). Serve launch adds `--cache-idle-slots` when a checkpoint dir exists (`process-manager.mjs:346-350`). `stop()` writes alias-global `on-stop` KV (`process-manager.mjs:497-502`). Identity is only `authenticated` vs `loopback-dev` (`gateway.mjs:35-43`). `--parallel 1` (cursor/android/windows/note9). | Strip on live hops; no idle-slot spill of user KV |
| Output tags | `stripEscapes` removes CSI/OSC/C0-C1 only (`util.mjs:137-141`). No ZWSP, bidi, or language-tag chars. | Extend `stripEscapes`; reuse in sanitize |
| CPU pins | `applyPriority` nice-level only (`hosts/windows.mjs:40-47`). No affinity. Cursor nexus **and** specialists are `cpu-4` (fallback `cpu-6`). | `CpuSetAllocator`; **nexus stays 4**; refuse oversubscribe |
| Idle poll | `--poll 0` only in `config/agents.cursor.json:38-39`. Android/windows/note9 llama `base_args` omit it. `buildLaunch` does not inject it. | Enforce in `buildLaunch` |
| Image/audio | `decodeDataUrl` is bytes+mime (`gateway.mjs:253-259`). Whisper/SD get the blob with no scan (`nativeRequestInit`, `gateway.mjs:263-271`). Policies `policies/vision-layout.md`, `audio-transcription.md`, `image-generation.md` have no scan SHALL. | `src/media-scan.mjs` + policy lines |

---

## 1. Timing quantization / tok-padding

**Invariant:** wall-clock of a hop and size of each flushed SSE/JSON frame do not vary with token count or inter-token gaps. Semantic text is unchanged.

New `src/timing-quant.mjs`:

```js
export const QUANT_MS = 50;
export const FRAME_BYTES = 512; // SSE data frame, space-padded in a dropped field

export function ceilQuantum(elapsedMs, q = QUANT_MS) {
  const e = Math.max(0, Number(elapsedMs) || 0);
  const n = Math.max(1, Number(q) || QUANT_MS);
  return Math.ceil((e + Number.EPSILON) / n) * n;
}

export function holdMs(startedAt, now = Date.now(), q = QUANT_MS) {
  return Math.max(0, ceilQuantum(now - startedAt, q) - (now - startedAt));
}

/** Pad a UTF-8 buffer to FRAME_BYTES with trailing spaces inside `pad` (clients ignore). */
export function padFrame(obj, bytes = FRAME_BYTES) {
  const body = { ...obj, pad: '' };
  let raw = Buffer.from(JSON.stringify(body));
  if (raw.length >= bytes) return raw.subarray(0, bytes); // never emit a longer frame
  body.pad = ' '.repeat(bytes - raw.length - 2); // 2: "" around pad once re-encoded; adjust in tests
  raw = Buffer.from(JSON.stringify(body));
  if (raw.length < bytes) body.pad += ' '.repeat(bytes - raw.length);
  return Buffer.from(JSON.stringify(body)).subarray(0, bytes);
}
```

**Pass 3 (do not fork):** strip `timings` and `padFrame` **inside** the hop (off-slot work). **`await sleep(holdMs(t0))` runs only after PolicyGate `release()`** — never inside `proxyJson` / `deliverPeek` while `responsive` holds `active`. RF1 first.

Stream branch must not `pipeline` the upstream body: buffer SSE through `handoff.mjs` `SseParser`, flush on quantum, each event `padFrame`'d, **no `timings`**. Do not flush a short last frame early; pad it. Wall-clock hold is the gateway's post-`release` sleep.

Patch `Mailbox.push`: `ts: quantizeTs(partial.ts)` where `quantizeTs(t) = Math.floor(t / QUANT_MS) * QUANT_MS`.

Patch `Gateway.health`: drop `uptime_ms` or quantize to 1s. Occupancy stats go away in F2.

**Tests** (`test/timing-quant.test.mjs`):

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ceilQuantum, holdMs, padFrame, QUANT_MS, FRAME_BYTES } from '../src/timing-quant.mjs';

test('ceilQuantum is a multiple of QUANT_MS and monotonic', () => {
  for (const e of [0, 1, QUANT_MS - 1, QUANT_MS, QUANT_MS + 1, 1000]) {
    const q = ceilQuantum(e);
    assert.equal(q % QUANT_MS, 0);
    assert.ok(q >= e);
  }
  assert.equal(ceilQuantum(0), QUANT_MS);
});

test('holdMs is never negative and finishes on a quantum', () => {
  const t0 = 1_000_000;
  assert.equal(holdMs(t0, t0), QUANT_MS);
  assert.equal(holdMs(t0, t0 + QUANT_MS), 0);
  assert.equal((holdMs(t0, t0 + 13) + 13) % QUANT_MS, 0);
});

test('padFrame is exactly FRAME_BYTES', () => {
  for (const obj of [{}, { choices: [{ delta: { content: 'x' } }] }, { a: 'y'.repeat(40) }]) {
    const buf = padFrame(obj);
    assert.equal(buf.length, FRAME_BYTES);
  }
});
```

Extend `test/proxy.test.mjs`: non-stream response `content-length` is `FRAME_BYTES`; two bodies with different completion lengths still same length. Fake clock: inject `now` if needed via optional `clock` arg on `proxyJson` (default `Date.now`).

Extend `test/mailbox.test.mjs`: two pushes 1ms apart share `ts`.

---

## 2. Constant-size mailbox envelopes

**Invariant:** every stored/exported envelope is `ENVELOPE_BYTES`. Occupancy counters do not leave the process. `recent()` returns padded copies, never raw objects with live payload shape.

`src/monitor/ids.mjs`:

```js
export const SLOT_BYTES = 16;          // seq+ticket packed (keep)
export const ENVELOPE_BYTES = 256;     // full export unit
export const PAYLOAD_HASH_LEN = 64;    // sha256 hex
```

`src/mailbox.mjs` `clonePayload`: always hash. Drop the `length <= 256` keep-raw branch.

```js
function clonePayload(payload) {
  const canonical = payload == null ? '' : (typeof payload === 'string' ? payload : JSON.stringify(payload));
  return createHash('sha256').update(canonical).digest('hex');
}
```

Same change in `src/monitor/ipc.mjs` `clonePayload`.

Add:

```js
publicStats() {
  return { capacity: this.capacity }; // no size/pushed/dropped/seq/listeners
}
```

`Gateway.health` and `/v1/monitor/recent` and `handleMonitorSnapshot` use `publicStats()`, not `stats()`. Monitor-internal drain listeners may keep full `stats()` in-process.

Pack on export:

```js
export function packEnvelope(event) {
  const rec = {
    seq: event.seq,
    kind: String(event.kind ?? '').slice(0, 32),
    source: String(event.source ?? '').slice(0, 48),
    ticket: typeof event.ticket === 'string' ? event.ticket.slice(0, 64) : event.ticket,
    ts: event.ts,
    payload: typeof event.payload === 'string' ? event.payload : '',
    target: String(event.target ?? 'machine').slice(0, 16),
    pad: '',
  };
  return padFrame(rec, ENVELOPE_BYTES);
}
```

`recent()` maps through `packEnvelope` then JSON.parse of the padded frame (or return the buffer). Pick one; tests check `Buffer.byteLength(JSON.stringify(row)) === ENVELOPE_BYTES` if returning objects with `pad`.

**Tests** (`test/mailbox.test.mjs` add):

- any payload (empty, short object, long string) yields `payload` of length 64 hex
- `recent()` rows all serialize to `ENVELOPE_BYTES`
- `publicStats()` has only `capacity`
- existing drop-oldest test still uses in-process `stats()`

`test/gateway.test.mjs` `health includes mailbox stats`: assert `health.body.mailbox.size` is undefined; `capacity` remains.

`test/monitor-entropy.test.mjs` already forbids secret keys on payload; hashing makes that stronger — keep it.

---

## 3. No `cache_prompt` across tenants

**Invariant:** a live chat/completions hop never sets `cache_prompt`. Slot idle-spill is off on serve. KV checkpoints are not restored except the primed stock prompt, and **only when RF2 `refs=0` and slot `is_processing=false`**.

`prepareInferenceBody` (`gateway.mjs:176`):

```js
  delete payload.cache_prompt;
  delete payload.cache_prompt_save;
  payload.cache_prompt = false;
```

Do this for every alias, including nexus. Prime (`bin/green-roomz.mjs` `cmdPrime`) talks to llama-server on the agent port, not the gateway — leave that `cache_prompt: true`.

`ProcessManager.buildLaunch` (`process-manager.mjs:346-350`): do not add `--cache-idle-slots` on serve. If a checkpoint dir is set, still pass `--slot-save-path` for explicit prime snapshots only.

`stop()`: `checkpoint: true` must not write `on-stop` when the slot has served a user turn. Simplest: `stop(alias, { checkpoint: false })` as the default on evict; keep checkpoint only for `snapshotModel` from `prime`.

`maybeRestoreDefault`: already gated on `prime.promptSha` + model + binary. **Pass 3:** call it only when hop `refs=0` **and** llama `/slots` reports `is_processing=false`. Never restore `on-stop.bin`. Never restore mid-hop (RACE-L2).

Identity is coarse (`authenticated` for every Bearer). Until principals are split, session id is the tenant key — and even then, with `--parallel 1` there is one slot, so the only safe live policy is `cache_prompt: false`.

**Tests**

`test/gateway.test.mjs` (or `test/covert-cache.test.mjs`): fetchImpl records the JSON body sent upstream; a client body with `cache_prompt: true` arrives upstream as `false`.

`test/process-manager.test.mjs`: `buildLaunch` with `checkpointDir` set does not contain `--cache-idle-slots`; may contain `--slot-save-path`. Launch args contain `--poll` `0` (F6) and `--threads` default 4 unless the profile already set threads (F5).

---

## 4. Strip ZWSP / tag chars from model output

**Invariant:** assistant `content` and `delta.content` after sanitize contain none of the filter set. User prompts are not rewritten here (this is output-side).

Replace `stripEscapes` in `src/util.mjs`:

```js
const CSI = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;
const OSC = /\u001b\][\s\S]*?(?:\u0007|\u001b\\)/g;
// Format + bidi + BOM + ZW* + word joiner + TAG + variation selectors used as tags
const COVERT_FORMAT = /[\u00AD\u034F\u061C\u180E\u200B-\u200F\u2028-\u202E\u2060-\u2064\u2066-\u206F\uFEFF\uFFF9-\uFFFB]/g; // includes U+2028 LS, U+2029 PS
const TAG_CHARS = /\uDB40[\uDC01\uDC20-\uDC7F]/g; // U+E0001, U+E0020–U+E007F as UTF-16
const VS_SUP = /\uDB40[\uDD00-\uDDEF]/g;         // U+E0100–U+E01EF

export function stripEscapes(value) {
  return String(value ?? '')
    .replace(OSC, '')
    .replace(CSI, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '')
    .replace(COVERT_FORMAT, '')
    .replace(TAG_CHARS, '')
    .replace(VS_SUP, '')
    .replace(/[ \t]+$/gm, ''); // trailing space/tab only; keep LF
}
```

`sanitizeCompletionJson` already runs `stripEscapes` on string content. Also walk array `message.content` parts (`type: text`). Whisper transcripts go through `wrapNativeAsChat` — run `stripEscapes` on that string too (`gateway.mjs:206`).

**Pass 2 (B18):** the same `COVERT_FORMAT` (including U+2028/U+2029) MUST run in `stripControls` and `headerSafe` / `safeReason`, not only `stripEscapes`. LS in `body.model` or HANDOFF `reason` is the remaining split.

**Tests** — extend `test/proxy.test.mjs`:

```js
test('strips zwsp and bidi from completion content', async () => {
  // ... same proxyJson harness ...
  content: 'ok\u200b\u200d\u202e\u2028\u2029txt  '
  // assert equal 'oktxt'
});
```

Add `test/util-strip.test.mjs` listing each class (ZWSP, ZWNJ, WJ, BOM, LRE/RLO, U+2028, U+2029, TAG A, VS1) as a one-char input that becomes `''`. Trailing `ok   ` → `ok`. Do not compose messages; one char per assert is enough.

---

## 5. CPU disjoint pins, 4-thread default

**Invariant:** two live llama children never share a logical CPU. **Σ `--threads` of live llama processes ≤ `os.cpus().length`.** Cursor resident is `cpu-4` with `cpu-6` fallback (`agents.cursor.json:313-351`) — do **not** assume nexus=2 (that is Windows). On a 4-CPU box resident+specialist must not both be 4. Refuse `cpu-6` when logical < 6. Empty profiles must get an injected `--threads`, not llama `hardware_concurrency`. `applyPriority` stays.

New `src/cpu-set.mjs`:

```js
export const DEFAULT_THREADS = 4;
export const NEXUS_THREADS = 4; // Cursor box; Windows cpu-2 stays that manifest

export function allocateSets(logical, agents) {
  const n = Math.max(1, logical | 0);
  const out = new Map();
  let cursor = 0;
  for (const { alias, threads } of agents) {
    const t = Math.max(1, threads | 0);
    const cpus = [];
    if (cursor + t > n) {
      out.set(alias, []); // empty = do not spawn; never wrap
      continue;
    }
    for (let i = 0; i < t; i += 1) cpus.push(cursor++);
    out.set(alias, cpus);
  }
  return out;
}

export function disjoint(a, b) {
  const s = new Set(a);
  return b.every((c) => !s.has(c));
}
```

`ProcessManager.buildLaunch`: if llama-server and args lack `--threads`, push `--threads`, `DEFAULT_THREADS`. **Cursor nexus stays 4.** If `allocateSets` returns `[]` for an alias, **do not spawn** (no wrap, no `cpu-6` retry after timed-out `cpu-4`). vulkan-all rewrite stays Windows/APU split only.

**Tests:** `allocateSets(8,[{4},{4}])` disjoint; `(8,[{4},{6}])` second empty; `(4,[{4},{4}])` second empty → no spawn.

`startProfile`: after spawn, `this.hostAdapter?.applyAffinity?.(child, cpus)` where `cpus` comes from a process-manager-owned `CpuSetAllocator` (one set per live alias; released on `stopRecord`).

`WindowsHostAdapter.applyAffinity` (this adapter is also the POSIX host):

```js
applyAffinity(child, cpus) {
  if (!child?.pid || !cpus?.length) return false;
  try {
    if (process.platform === 'linux') {
      const list = cpus.join(',');
      execFile('taskset', ['-pc', list, String(child.pid)], { timeout: 2000 });
      return true;
    }
    // win32: skip if no helper; tests mock this
    return false;
  } catch {
    return false;
  }
}
```

Android sidecar: no-op with `applied: false` (no AID_ROOT). Document that Note9 skips pins.

**Tests** (`test/cpu-set.test.mjs`):

```js
test('nexus 4 + specialist 4 on 8 cpus are disjoint', () => {
  const sets = allocateSets(8, [
    { alias: 'tool-router-agent', threads: 4 },
    { alias: 'general-text-speculator', threads: 4 },
  ]);
  assert.deepEqual(sets.get('tool-router-agent'), [0, 1, 2, 3]);
  assert.deepEqual(sets.get('general-text-speculator'), [4, 5, 6, 7]);
});

test('cpu-6 after nexus 4 on 8 cpus is empty (do not spawn)', () => {
  const sets = allocateSets(8, [
    { alias: 'tool-router-agent', threads: 4 },
    { alias: 'specialist', threads: 6 },
  ]);
  assert.equal(sets.get('specialist').length, 0);
});

test('4+4 on 4 cpus: specialist empty, never wrap', () => {
  const sets = allocateSets(4, [
    { alias: 'a', threads: 4 },
    { alias: 'b', threads: 4 },
  ]);
  assert.equal(sets.get('b').length, 0);
});
```

`test/process-manager.test.mjs`: cpu-4 still 4; a profile with no `--threads` gets 4; nexus cpu-2 stays 2. Mock `applyAffinity` called with a list of length 4 for a specialist.

Existing vulkan-all test (logical-2) remains; allocator must pin vulkan-all to its thread count, still disjoint from nexus 0-1.

---

## 6. `--poll 0` idle

**Invariant:** every llama-server argv contains `--poll 0`. No busy-wait idle. Not overridable by profile/extra_args to a non-zero value.

`buildLaunch` after concatenating runtime/base/extra/profile args:

```js
function forcePoll0(args) {
  const next = [...args];
  const i = next.indexOf('--poll');
  if (i !== -1 && i + 1 < next.length) next[i + 1] = '0';
  else next.push('--poll', '0');
  return next;
}
```

Call for `runtime.kind === 'llama-server'` only.

Also add `"--poll", "0"` to android/windows/note9 `runtimes.llama_server.base_args` so config matches the enforcer.

**Tests:** `buildLaunch` for cpu-4, vulkan-all, and a profile that passes `--poll 99` all end with poll value `0`. Cursor manifest already has it; config test can assert all four manifests after load: llama base_args poll is 0.

---

## 7. Image / audio are not opaque

**Invariant:** no native hop receives image/audio bytes until `scanMedia` accepts them under a named policy. Reject undecodable, wrong-magic, oversized, or trailing-garbage containers.

New `src/media-scan.mjs`:

```js
export const MEDIA_POLICIES = Object.freeze({
  'vision-layout-agent': { kinds: ['image/png', 'image/jpeg', 'image/webp'], maxBytes: 8 * 1024 * 1024 },
  'image-generation-agent': { kinds: ['image/png'], maxBytes: 8 * 1024 * 1024 }, // output also scanned
  'audio-transcription-agent': { kinds: ['audio/wav', 'audio/mpeg', 'audio/ogg'], maxBytes: 16 * 1024 * 1024 },
});

const MAGIC = [
  { mime: 'image/png', test: (b) => b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) },
  { mime: 'image/jpeg', test: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: 'image/webp', test: (b) => b.length >= 12 && b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP' },
  { mime: 'audio/wav', test: (b) => b.length >= 12 && b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WAVE' },
];

export function sniffMime(bytes) {
  const b = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes ?? []);
  return MAGIC.find((m) => m.test(b))?.mime ?? null;
}

export function scanMedia(bytes, { alias, declaredMime } = {}) {
  const policy = MEDIA_POLICIES[alias];
  if (!policy) return { ok: false, reason: 'no media policy' };
  const b = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes ?? []);
  if (b.length === 0) return { ok: false, reason: 'empty' };
  if (b.length > policy.maxBytes) return { ok: false, reason: 'too large' };
  const sniffed = sniffMime(b);
  if (!sniffed || !policy.kinds.includes(sniffed)) return { ok: false, reason: 'magic mismatch' };
  if (declaredMime && declaredMime !== sniffed && declaredMime !== 'application/octet-stream') {
    return { ok: false, reason: 'declared mime mismatch' };
  }
  if (sniffed === 'image/png' && !pngEndsAtIend(b)) return { ok: false, reason: 'trailing bytes' };
  if (sniffed === 'audio/wav' && !wavMatchesRiffSize(b)) return { ok: false, reason: 'trailing bytes' };
  return { ok: true, mime: sniffed, bytes: b };
}
```

`pngEndsAtIend` / `wavMatchesRiffSize`: structural end == buffer end. No discussion of other containers.

Wire: `nativeRequestInit` for whisper and the vision path that attaches `image_url` must `scanMedia` first; on `ok: false` throw `ValidationError` with the reason. Image generation output (`wrapNativeAsChat` kind `image`) is scanned before return.

Policy files — one line each:

- `policies/vision-layout.md`: `Refuse work unless the attached image passed gateway media-scan (magic, size, no trailing bytes).`
- `policies/audio-transcription.md`: same for audio.
- `policies/image-generation.md`: `Returned images pass the same media-scan before the client sees them.`

**Tests** (`test/media-scan.test.mjs`):

- 8-byte PNG magic of the right length that ends at IEND → ok for vision
- JPEG magic labeled `image/png` → reject
- empty / oversize → reject
- unknown alias → reject (`no media policy`)
- PNG with extra byte after IEND → reject (assert reason `trailing bytes` only)

`test/native-paths.test.mjs`: the existing `xxxx` base64 audio that is not a real WAV must now 400, not reach whisper. Add a tiny valid WAV fixture (RIFF header with matching size) for the happy path.

---

## Apply order

1. F4 strip + F6 poll-0 (local, no schema bump)
2. F3 cache_prompt false + drop `--cache-idle-slots` + stop checkpoint default false
3. F1 timing + F2 envelope (gateway export shape changes; update health/monitor tests)
4. F5 affinity (Linux `taskset`; tests mock)
5. F7 media-scan (native-path tests will need a well-formed tiny fixture)

`ORCHESTRATOR_BOUNDED_KEYS` does not need new gateway keys if quanta stay in `src/constants.mjs`. If ops want them in the manifest later, that is a sysadmin schema bump.

## Out of scope

- git push, reboot, vote/lockdown
- CUDA mapped rings, SharedArrayBuffer
- Exploit recipes, stego payloads, recovery tests
- Finer identity than Bearer `authenticated` (call out as follow-up: per-key principal)

## Files to add / touch

| File | Change |
|---|---|
| `src/timing-quant.mjs` | new |
| `src/cpu-set.mjs` | new |
| `src/media-scan.mjs` | new |
| `src/util.mjs` | `stripEscapes` |
| `src/proxy.mjs` | hold + padFrame |
| `src/handoff.mjs` | quantized SSE |
| `src/mailbox.mjs` | hash-always, publicStats, quantized ts |
| `src/monitor/ipc.mjs` | hash-always |
| `src/monitor/ids.mjs` | `ENVELOPE_BYTES` |
| `src/gateway.mjs` | cache_prompt false; publicStats; scanMedia; strip transcripts |
| `src/process-manager.mjs` | poll 0, default threads 4, no cache-idle-slots, affinity |
| `src/hosts/windows.mjs` | `applyAffinity` |
| `src/constants.mjs` | `QUANT_MS`, `FRAME_BYTES`, `DEFAULT_THREADS` (optional re-export) |
| `config/agents.{android,windows,note9}.json` | `"--poll","0"` in llama base_args |
| `policies/{vision-layout,audio-transcription,image-generation}.md` | scan SHALL |
| `test/timing-quant.test.mjs` | new |
| `test/cpu-set.test.mjs` | new |
| `test/media-scan.test.mjs` | new |
| `test/util-strip.test.mjs` | new |
| `test/{proxy,mailbox,gateway,process-manager,native-paths}.test.mjs` | extend |


---

## Finder-board match (CC-1..CC-27)

Source: `/workspace/reviews/covert-review.md` (same bytes as `covert-channel-review.md`). Tree still unpatched.

| CC | Sev | Covered by original F? | Extra patch |
|---|---|---|---|
| CC-1 stream `timings` | H | F1 (must not `pipeline` raw) | Also run `sanitizeCompletionJson` on every SSE event; strip extra upstream headers (F8a) |
| CC-2 ZW / trailing space | H | F4 | U+2028/U+2029 now in COVERT_FORMAT (`\u2028-\u202E`). Trim trailing space/tab. NFC. No homoglyph fold. |
| CC-3 image-gen PNG body | H | F7 | `completeNativeChat` must sanitize + scan (F9) |
| CC-4 TTS WAV + transcript | H | no | **F10** TTS |
| CC-5 mailbox HTTP dump | H | F2 | **F11** session-filter / drop HTTP recent |
| CC-6 hop ts + tickets | H | F1 ts + F2 | F11 (omit foreign tickets) |
| CC-7 `/metrics` | H | no | **F12** |
| CC-8 slot-0 KV residue | H | F3 `cache_prompt:false` | **F13** restore prime-only after each live hop |
| CC-9 forwarded slot fields | H | F3 deletes `cache_prompt` | **F8** allowlist, not denylist |
| CC-10 loopback llama-server | H | no | **F14** `--no-webui`, no `--metrics`, **gate `/slots`**, refuse `0.0.0.0` (no API-key product) |
| CC-11 LLC / no affinity | H | F5 | Pin whisper/piper/sd too; android/note9 `max_warm_specialists: 1` |
| CC-12 council `ms` + jsonl | H | no | **F15** |
| CC-13 disk KV / idle slots | H | F3 | — |
| CC-14 route headers | M | no | **F16** |
| CC-15 health/models/props | M | F2 occupancy + F1 uptime | Drop `uptime_ms` or 1s bucket |
| CC-16 proxied `usage` | M | no | **F17** zero or bucket |
| CC-17 chat SSE cadence | M | F1 | — |
| CC-18 error JSON + log tail | M | no | **F18** |
| CC-19 unpadded mailbox | M | F2 (hash whole JSON, including nested) | — |
| CC-20 reject cache forever | M | no | **F19** |
| CC-21 `serve.log` tee | M | no | **F20** |
| CC-22 whisper unstripped | M | F4+F7 partial | **F9** strip; never stringify alignment JSON |
| CC-23 native wrappers skip sanitize | M | no | **F9** |
| CC-24 benchmarks tok/s disk | M | no | **F21** omit tps fields (not on HTTP today) |
| CC-25 route-plan body | L | no | F16 reason codes enum |
| CC-26 drain broadcast | L | no | keep `listeners: 0` on gateway; test it |
| CC-27 in-memory logger chain | L | no | **F22** cap; drop → `{ok:false, dropped:true}` |

---

## 8. Upstream body allowlist (CC-9)

`prepareInferenceBody` currently deletes three keys and spreads the rest. Switch to an allowlist. Drop `cache_prompt`, `id_slot`, `slot_id`, and any other llama slot/cache field by omission.

```js
const INFERENCE_ALLOW = new Set([
  'model', 'messages', 'max_tokens', 'temperature', 'top_p', 'top_k', 'min_p',
  'typical_p', 'stop', 'stream', 'presence_penalty', 'frequency_penalty',
  'repeat_penalty', 'n', 'response_format', 'tools', 'tool_choice',
]);

export function prepareInferenceBody(body, agent) {
  const stripped = stripSlashCommand(body);
  const src = injectSystemPolicy({ ...stripped, model: agent.alias }, agent);
  const payload = {};
  for (const key of INFERENCE_ALLOW) if (key in src) payload[key] = src[key];
  payload.cache_prompt = false;
  // nexus thinking flags stay as today, applied after the allowlist
  ...
}
```

**Tests:** client body with `cache_prompt`, `id_slot`, `timings`, `foo: 1` — upstream JSON has none of those keys; `cache_prompt === false`.

---

## 8a. Stream sanitize (CC-1)

`proxy.mjs:80` `canSanitize = !body?.stream` is the hole. Stream must use the handoff SSE parser (already strips on peek). Direct-alias/text-fallback stream (`gateway.mjs:928-936`, `:1123-1129`) must not `pipeline` llama bytes.

Also: `downstreamHeaders` currently copies every non-hop-by-hop header. Allowlist `content-type` only on completions.

**Tests:** fake stream whose first SSE JSON has `timings: { predicted_n: 9 }` — client chunk has no `timings` key. Response headers exclude `x-llama-*` if the fake upstream set one.

---

## 9. Native / whisper / image wrappers (CC-3, CC-22, CC-23)

`completeNativeChat` (`gateway.mjs:555-559`) returns `wrapNativeAsChat` unsanitized.

- After parse: if whisper, `content = stripEscapes(String(parsed.text ?? '').trim())` — never `JSON.stringify(parsed)` on missing `.text` (use `''` + 502).
- If image: `scanMedia` on decoded PNG before wrapping; reject trailing bytes.
- Always `sanitizeCompletionJson(wrapped)` then `jsonResponse`.

**Tests:** whisper `{ text: 'ok\\u200b' }` → `'ok'`. Whisper `{ alignment: [1] }` with no `text` → no alignment in body. Image wrapper with trailing-byte PNG → 400.

---

## 10. TTS (CC-4)

`completeSpeech` (`gateway.mjs:569-610`):

- `mkdtemp` mode `0o700`; `rm` in `finally` stays.
- `scanMedia(wav, { alias: 'speech-synthesis-agent' })` — add that alias to `MEDIA_POLICIES` (`audio/wav`, same max).
- Do not put source text on `message.audio.transcript`. Empty string or omit.
- `jsonResponse` already sets `content-length`; after F1 padFrame the body is constant-size.

**Tests:** existing TTS test (`gateway.test.mjs` audio data URL) — `transcript` absent/empty; scanned WAV still `data:audio/wav;base64,` with RIFF/WAVE magic.

---

## 11. HTTP mailbox dump is session-local or gone (CC-5, CC-6)

`/v1/monitor/recent` and `handleMonitorSnapshot` currently return `this.mailbox.recent()` + `stats()` with no ticket filter.

**Pass 3 this cut:** GET `/v1/monitor/recent` stays **200**. Tickets are **hashed** (F-B8). Occupancy via `publicStats()` only. Session-local / empty dump is **P1** (F11).

**Tests this cut:** no UUID-shaped `ticket` in GET recent. `stats.size` undefined.

---

## 12. `/metrics` (CC-7)

`metrics()` (`gateway.mjs:431-445`) and `/metrics` (`:382-385`):

Return only `{ policy }` unless `identity === 'authenticated'` **and** a new env `GREEN_ROOMZ_METRICS=1`. Even then: no `pid`, no `freeMemoryBytes`/`loadAverage`. `in_flight`/`queued` bucket to `{0,1,2+}`.

Default shipped: no PIDs, no RAM.

**Tests:** unauthenticated `/metrics` has no `processes`, no `resources`.

---

## 13. Slot-0 residue after a live hop (CC-8)

`cache_prompt: false` is not enough if llama keeps the last prefix in slot 0.

**Pass 3:** restore the primed **default** snapshot **only** when RF2 `refs=0` **and** `/slots` `is_processing=false`. If no prime file, do not restore `on-stop.bin`. Never restore while a hop is in flight.

**Tests:** spy: `refs>0` or `is_processing=true` → restore **not** called. After unpin + idle, restore of `default` may run; `on-stop` never fetched.

---

## 14. Loopback llama-server (CC-10)

**Pass 3 — no API-key product** (P2). Gateway already `--host 127.0.0.1`. `buildLaunch`:

- `--no-webui` if not already present
- never add `--metrics` / `--log`
- **gate llama `/slots`**: process-manager is the only client; refuse extra_args/profile.args that set `--host 0.0.0.0`; gateway still does **not** proxy `/slots` (8080 `/slots` stays 404)
- inherit `--api-key` **only if** the operator later enables P2

**Tests:** args include `--no-webui`, exclude `--metrics`, refuse `--host 0.0.0.0`. Do **not** require `--api-key` in v1.

---

## 15. Council (CC-12)

HTTP: drop per-alias `ms` from council JSON and from `x-green-roomz-council`. Keep winner/outlier as aliases only.

Disk: if `council_dir` is set, write `scores.jsonl` with `{ alias, ok }` only (no `ms`, no prompt, no answers). `appendFileSync` with `{ mode: 0o600 }`. Default manifests already omit `council_dir` — keep it that way.

**Tests:** council response body has no `ms` key. With a temp dir, jsonl lines parse and have no `prompt`/`content`/`ms`.

---

## 16. Route identity headers (CC-14, CC-25)

`routeHeaders` (`gateway.mjs:767-777`): drop `x-green-roomz-hops` and `x-green-roomz-route-reason` from the default client view, or replace reason with a closed enum (`mailbox|native|nexus|fallback|tts`) padded to a fixed header length via `headerSafe` + pad.

Route-plan body (`:849-855`): keep `route` alias; drop `confidence`; `reason_code` enum only.

**Tests:** a chat response headers omit hops, or hops is a fixed-length pad. `reason` is one of the enum.

---

## 17. Proxied `usage` (CC-16)

`sanitizeCompletionJson`: delete `usage`, or replace with zeros (gateway-authored bodies already zero). Prefer delete on proxied llama JSON so size does not ride along.

SSE chunks: delete `usage` too (CC-17 notes chunks keep it).

**Tests:** extend `test/proxy.test.mjs` — upstream `usage: { prompt_tokens: 12, completion_tokens: 3 }` is absent downstream.

---

## 18. Error JSON + start-fail tail (CC-18)

`startProfile` catch (`process-manager.mjs:466-467`) must not append `record.logs` (last 2000 chars) into `UnavailableError` message.

Gateway `error.details`: only structured codes (`memory_floor`, `timeout`), never paths or log text. `redact()` already covers Bearer/data-URL; add a path scrub (`/[^\s]+\\.(gguf|bin|so)[^\s]*/i` → `[path]`).

504 may keep a constant `timeout_ms` (already a config default) — do not echo the actual elapsed.

**Tests:** failing ensure’s HTTP body has no `tok/s` substring and no `.gguf` path.

---

## 19. Reject cache TTL (CC-20)

`rejectsByTicket` (`monitor/states.mjs:151-178`): cap map size (e.g. 256) and drop oldest; or TTL = mailbox `recentLimit`. `peekReject` after cap must not return a deleted ticket.

Do not export rejects via HTTP recent (F11).

**Tests:** insert 300 distinct tickets; size ≤ 256; oldest missing.

---

## 20. `serve.log` (CC-21)

`serve-console.mjs`: keep listen/pre-warm. Drop child stdout/stderr tee of llama lines matching `/tok\/s|predicted_n|prompt_ms/`. Start-fail tails stay process-local, not HTTP (F18).

**Tests:** a fake line `12.3 tok/s` written to the child logger does not appear in the serve-console buffer.

---

## 21. Benchmark store (CC-24)

`benchmark.mjs` write: omit `promptTps` / `generationTps` (keep `coldStartMs` bucketed to 100ms if needed). Not served on `/metrics` today — keep it that way.

**Tests:** written JSON has no `Tps` keys.

---

## 22. Logger chain (CC-27)

**Pass 3:** missing path / flood (`inFlight` cap) / write failure → **`{ok:false, dropped:true}`**, never `ok:true`. Cap `chain` at `recentLimit` (64). Envelopes hashed like mailbox (F2). Gateway must not `catch {}` a false `ok`.

**Tests:** unset path emit → `{ok:false, dropped:true}`; 100 emits → `read()` length 64.

---

## 23. Android / Note9 warm cap (CC-11 layout)

Unset `max_warm_specialists` admits up to 7 llama-servers. Set `max_warm_specialists: 1` on `config/agents.android.json` and `agents.note9.json` (match cursor/windows). Allocator then pins nexus **4** + specialist only if remaining CPUs ≥ specialist threads (else empty set, no spawn).

Also run `applyAffinity` for whisper/piper/sd children (1 CPU each if no `--threads`).

**Tests:** `ProcessManager` constructed with android-like manifest without the key still defaults to 1, **or** the json files contain the key. Prefer json so validateManifest stays honest.

---

## Drain listeners (CC-26)

Gateway constructs `new Mailbox()` / `MonitorIpc` with no `onEvent`. Add a unit assert `mailbox.stats().listeners === 0` after `new Gateway(...)`. Do not register extra listeners on the HTTP path.

---

## Homoglyph residual (CC-2)

F4 strips ZW/bidi/TAG **and U+2028 LS / U+2029 PS** (`COVERT_FORMAT` range `\u2028-\u202E`). Trailing space/tab stripped per line. Keep LF. Do **not** fold confusables — **homoglyphs stay after F4** (stitch). No decoder, no recipe table.

## Researcher punch-list (this ping)

Already in this file; **tree still frozen**:

| Named extra | Section |
|---|---|
| stream llama `timings` / tok/s (`proxy.mjs`) | F1 + §8a |
| U+2028/U+2029 + trailing space | F4 (now explicit) |
| unsanitized PNG/WAV | F7 + §9 + §10 |
| `/v1/monitor/recent` last-64 cross-session | §11 |
| `/metrics` queue + PIDs | §12 |
| slot-0 KV residue per alias | F3 + §13 |
| loopback 818x unsanitized | §14 |

## Pass 2 addenda (see `covert-pass2.md`)

Live `:8080` (2026-09-03 PT): `/metrics` pid 1849480 + RAM; `/v1/monitor/recent` 3 hops with session tickets + unhashed `{reason,hops}`; `/health` `uptime_ms` + occupancy. Tree still frozen.

| New | Patch |
|---|---|
| F4 `stripControls`/`headerSafe` LS/PS (B18) | same `COVERT_FORMAT` in all three |
| F5 Σ-thread cap; **nexus stays 4**; refuse oversubscribe; empty set → no spawn | `allocateSets(8,[{4},{4}])` ok; `(8,[{4},{6}])` / `(4,[{4},{4}])` specialist empty |
| F11 nexus must not route MONITOR (B3) | `routeIsBad` / `allowlistedPlan` |
| F24 framing/HEAD ~6s (fuzz h012, r001, r002) | finite `headersTimeout`; 400 <100ms |
| F25 mailbox kind allowlist (fuzz m002, B12) | no lockdown/reboot/vote `ok:true` |
| F26 `messages:number` 500 text (fuzz c006) | 400 **`validation_error`** (also bool/object/string); never 500 |
| F27 publish after complete; IPC then hashed mailbox (RACE-G1/G2) | no success-before-body |

---

## Apply order (updated)

Still **do not patch the tree** this turn. Researcher integrates five packs, then gates beta.

When Researcher applies P0 (do not patch this turn):

1. RF1 PolicyGate, then RF2 refcount  
2. RF3 + **F5** nexus **4**; refuse oversubscribe; empty set → no spawn  
3. Fuzz messages 400 `validation_error`; GET-only dumps; JSON CT  
4. **F27** publish-after-complete; **F1** `holdMs` **after** `release`; peek slot idle  
5. **F25** kind allowlist; **F22** `{ok:false, dropped:true}`  
6. **F4** LS/PS (homoglyphs stay); **F14** gate `/slots` + no `0.0.0.0`; **F24** HEAD fail-closed  
7. hashed tickets this cut; F11 empty dump **P1**  
8. **P2:** F12 metrics, F15 council ms, F16 headers, F17 usage, F20/F21 logs/bench, F23 warm cap, API-key product  

## Files added by this match

| File | Change |
|---|---|
| `src/gateway.mjs` | allowlist; native sanitize; TTS scan; metrics; council; monitor recent; route headers |
| `src/proxy.mjs` | stream sanitize; usage delete; header allowlist |
| `src/process-manager.mjs` | `--no-webui`; no log tail on errors; restore prime after hop |
| `src/monitor/states.mjs` | reject cap |
| `src/monitor/logger.mjs` | chain cap |
| `src/benchmark.mjs` | omit tps |
| `src/serve-console.mjs` | drop tok/s lines |
| `config/agents.{android,note9}.json` | `max_warm_specialists: 1` |
| `test/gateway.test.mjs` / `test/proxy.test.mjs` / `test/monitor-*.test.mjs` | extend |
