import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { proxyJson } from '../src/proxy.mjs';
import { peekSpecialist } from '../src/handoff.mjs';
import { awaitWithAbort, deadlineSignal, isAbortError, isBenignSocketError, isTimeoutAbort, readCappedText } from '../src/util.mjs';
import { UpstreamProtocolError, UpstreamTimeoutError } from '../src/errors.mjs';

class FakeResponse extends EventEmitter {
  constructor() { super(); this.status = null; this.headers = null; this.chunks = []; this.ended = false; }
  get writableEnded() { return this.ended; }
  writeHead(status, headers) { this.status = status; this.headers = headers; }
  end(chunk) { if (chunk) this.chunks.push(chunk); this.ended = true; this.emit('finish'); }
  destroy() { this.ended = true; }
}

const CONF = { retry_initial_ms: 2, retry_max_ms: 4, retry_deadline_ms: 40 };

// --- util units ------------------------------------------------------------

test('deadlineSignal fires on the timeout when no caller signal', async () => {
  const sig = deadlineSignal(undefined, 20);
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(sig.aborted, true);
});

test('deadlineSignal passes through when deadline is falsy', () => {
  const ac = new AbortController();
  assert.equal(deadlineSignal(ac.signal, 0), ac.signal);
  assert.equal(deadlineSignal(undefined, 0), undefined);
});

test('isTimeoutAbort distinguishes our timeout from a caller cancel', () => {
  const caller = new AbortController();
  assert.equal(isTimeoutAbort({ name: 'TimeoutError' }, undefined), true);
  assert.equal(isTimeoutAbort({ name: 'AbortError' }, undefined), true);
  caller.abort();
  assert.equal(isTimeoutAbort({ name: 'TimeoutError' }, caller.signal), false);
});

test('isAbortError and isBenignSocketError cover hangup noise', () => {
  assert.equal(isAbortError({ name: 'AbortError' }), true);
  assert.equal(isAbortError({ code: 'ABORT_ERR', message: 'aborted' }), true);
  assert.equal(isBenignSocketError({ code: 'ECONNRESET' }), true);
  assert.equal(isBenignSocketError({ code: 'EPIPE' }), true);
  assert.equal(isBenignSocketError({ code: 'ERR_STREAM_DESTROYED' }), true);
  assert.equal(isBenignSocketError({ message: 'disk full' }), false);
});

test('awaitWithAbort rejects the waiter without cancelling the work', async () => {
  const ac = new AbortController();
  let finished = false;
  const work = new Promise((resolve) => setTimeout(() => { finished = true; resolve('ok'); }, 40));
  const waiter = awaitWithAbort(work, ac.signal);
  ac.abort(new Error('client hung up'));
  await assert.rejects(() => waiter);
  assert.equal(await work, 'ok');
  assert.equal(finished, true);
});

test('readCappedText streams and enforces the byte cap', async () => {
  const body = new ReadableStream({
    pull(c) { c.enqueue(new Uint8Array(64 * 1024)); },
  });
  await assert.rejects(
    () => readCappedText({ body }, 256 * 1024),
    (e) => e.code === 'UPSTREAM_TOO_LARGE',
  );
});

test('readCappedText falls back to .text() for stub responses', async () => {
  assert.equal(await readCappedText({ text: async () => 'hi' }, 1024), 'hi');
});

// --- proxyJson hardening ---------------------------------------------------

test('a stalled upstream becomes a 504 UpstreamTimeoutError, not a hang', async () => {
  const response = new FakeResponse();
  const started = Date.now();
  await assert.rejects(
    () => proxyJson({
      request: { method: 'POST', headers: {} },
      response,
      body: { model: 'general-text-speculator', messages: [] },
      target: 'http://127.0.0.1:9/v1/chat/completions',
      config: { ...CONF, upstream_timeout_ms: 60 },
      fetchImpl: (_url, init) => new Promise((_res, rej) => {
        init.signal.addEventListener('abort', () => rej(init.signal.reason ?? new Error('aborted')), { once: true });
      }),
    }),
    (e) => e instanceof UpstreamTimeoutError && e.status === 504,
  );
  assert.ok(Date.now() - started < 2000, 'must not hang');
});

test('an oversized buffered upstream body becomes a 502 UpstreamProtocolError', async () => {
  const response = new FakeResponse();
  await assert.rejects(
    () => proxyJson({
      request: { method: 'POST', headers: {} },
      response,
      body: { model: 'general-text-speculator', messages: [] },
      target: 'http://127.0.0.1:9/v1/chat/completions',
      config: { ...CONF, upstream_max_buffer_bytes: 128 * 1024 },
      fetchImpl: async () => ({
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        body: new ReadableStream({ pull(c) { c.enqueue(new Uint8Array(64 * 1024)); } }),
      }),
    }),
    (e) => e instanceof UpstreamProtocolError && e.status === 502,
  );
});

test('a caller cancel is re-thrown as-is, never masked as a timeout', async () => {
  const response = new FakeResponse();
  const caller = new AbortController();
  const p = proxyJson({
    request: { method: 'POST', headers: {} },
    response,
    body: { model: 'general-text-speculator', messages: [] },
    target: 'http://127.0.0.1:9/v1/chat/completions',
    config: { ...CONF, upstream_timeout_ms: 5000 },
    signal: caller.signal,
    fetchImpl: (_url, init) => new Promise((_res, rej) => {
      init.signal.addEventListener('abort', () => rej(init.signal.reason ?? new Error('aborted')), { once: true });
    }),
  });
  caller.abort(new Error('client hung up'));
  await assert.rejects(() => p, (e) => !(e instanceof UpstreamTimeoutError));
});

// --- handoff peek hardening ----------------------------------------------

test('peekSpecialist gives up on a specialist that never emits, marking it degraded', async () => {
  const started = Date.now();
  const neverEmits = new ReadableStream({ start() { /* no enqueue, no close */ } });
  const peek = await peekSpecialist({
    fetchImpl: async () => ({ status: 200, headers: new Headers({ 'content-type': 'text/event-stream' }), body: neverEmits }),
    request: { method: 'POST', headers: {} },
    target: 'http://127.0.0.1:9/v1/chat/completions',
    body: { model: 'qwenstral-code-speculator', messages: [] },
    peekTimeoutMs: 60,
  });
  assert.ok(Date.now() - started < 2000, 'must not hang');
  assert.equal(peek.degraded, 'peek_timeout');
  assert.equal(peek.reader, null, 'dead stream is not handed downstream');
  assert.equal(peek.finished, true);
});

test('peekSpecialist still returns a fast handoff before the deadline', async () => {
  const sse = new ReadableStream({
    start(c) {
      c.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"HANDOFF not my job"},"finish_reason":"stop"}]}\n\n'));
      c.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
      c.close();
    },
  });
  const peek = await peekSpecialist({
    fetchImpl: async () => ({ status: 200, headers: new Headers({ 'content-type': 'text/event-stream' }), body: sse }),
    request: { method: 'POST', headers: {} },
    target: 'http://127.0.0.1:9/v1/chat/completions',
    body: { model: 'qwenstral-code-speculator', messages: [] },
    peekTimeoutMs: 5000,
  });
  assert.equal(peek.handoff?.handoff, true);
  assert.match(peek.handoff.reason, /not my job/);
});

test('an already-ended response short-circuits without writing again', async () => {
  const response = new FakeResponse();
  response.end();
  await proxyJson({
    request: { method: 'POST', headers: {} },
    response,
    body: { model: 'general-text-speculator', messages: [] },
    target: 'http://127.0.0.1:9/v1/chat/completions',
    config: CONF,
    fetchImpl: async () => ({ status: 200, headers: new Headers(), body: null, text: async () => '{}' }),
  });
  assert.equal(response.status, null, 'no second writeHead');
});
