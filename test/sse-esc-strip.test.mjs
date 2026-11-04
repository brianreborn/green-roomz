import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { proxyJson, sanitizeSseDataLine, sanitizeCompletionJson } from '../src/proxy.mjs';
import { deliverPeek } from '../src/handoff.mjs';
import { stripInvisibleAndEsc, headerSafe } from '../src/util.mjs';

class FakeResponse extends EventEmitter {
  constructor() { super(); this.chunks = []; this.ended = false; this.destroyed = false; this.headersSent = false; }
  writeHead(status, headers) { this.status = status; this.headers = headers; this.headersSent = true; }
  write(chunk) { if (chunk) this.chunks.push(Buffer.from(chunk)); return true; }
  end(chunk) { if (chunk) this.chunks.push(Buffer.from(chunk)); this.ended = true; }
  destroy() { this.destroyed = true; this.ended = true; }
  get writableEnded() { return this.ended; }
  get body() { return Buffer.concat(this.chunks).toString('utf8'); }
}

const DIRTY = '\u001b[31mok\u200b\ufeff\u001b[0m';
const chunk = (content) => ({ choices: [{ delta: { content } }], timings: { predicted_ms: 12 }, usage: { prompt_tokens_details: { cached_tokens: 7 } } });

function readerOf(parts) {
  const enc = new TextEncoder();
  let i = 0;
  return { async read() { return i < parts.length ? { done: false, value: enc.encode(parts[i++]) } : { done: true, value: undefined }; }, releaseLock() {}, async cancel() {} };
}

test('stripInvisibleAndEsc removes ANSI wrapper, ZWSP, BOM', () => {
  assert.equal(stripInvisibleAndEsc(DIRTY), 'ok');
  assert.equal(stripInvisibleAndEsc('a\u001b]0;t\u0007b\u{E0041}\u202Ec'), 'abc');
  assert.equal(stripInvisibleAndEsc('line1\nline2\t'), 'line1\nline2\t');
});

test('sanitizeSseDataLine: JSON sanitized, [DONE] and framing preserved', () => {
  const out = sanitizeSseDataLine(`data: ${JSON.stringify(chunk(DIRTY))}`);
  assert.ok(out.startsWith('data: '));
  const j = JSON.parse(out.slice(6));
  assert.equal(j.timings, undefined);
  assert.equal(j.choices[0].delta.content, 'ok');
  assert.equal(j.usage.prompt_tokens_details.cached_tokens, 0);
  assert.equal(sanitizeSseDataLine('data: [DONE]'), 'data: [DONE]');
  assert.ok(!/[\r\n\u001b]/.test(sanitizeSseDataLine('data: x\u001b[2Jy')));
});

test('proxy stream: chunk split mid-event, no timings, content stripped', async () => {
  const frame = `data: ${JSON.stringify(chunk(DIRTY))}\n\ndata: [DONE]\n\n`;
  const response = new FakeResponse();
  const res = await proxyJson({
    request: { method: 'POST', headers: {} }, response,
    body: { model: 'm', stream: true, messages: [] },
    target: 'http://127.0.0.1:9/v1/chat/completions',
    config: { retry_initial_ms: 5, retry_max_ms: 10, retry_deadline_ms: 50 },
    fetchImpl: async () => ({ status: 200, headers: new Headers({ 'content-type': 'text/event-stream' }), body: { getReader: () => readerOf([frame.slice(0, 17), frame.slice(17)]) } }),
  });
  assert.equal(res.content, 'ok');
  assert.ok(!response.body.includes('"timings"'));
  assert.ok(!/[\u001b\u200b\ufeff]/.test(response.body));
  assert.ok(response.body.endsWith('data: [DONE]\n\n'));
});

test('proxy: bodyless upstream forwards no bytes', async () => {
  const response = new FakeResponse();
  await proxyJson({
    request: { method: 'POST', headers: {} }, response,
    body: { model: 'm', messages: [] },
    target: 'http://127.0.0.1:9/v1/chat/completions',
    config: { retry_initial_ms: 5, retry_max_ms: 10, retry_deadline_ms: 50 },
    fetchImpl: async () => ({ status: 200, headers: new Headers({ 'content-type': 'text/plain' }), body: null }),
  });
  assert.equal(response.status, 200);
  assert.equal(response.body, '');
});

test('deliverPeek live tail: no timings, content stripped', async () => {
  const parser = {
    buf: '',
    push(v) { this.buf += new TextDecoder().decode(v); const ev = []; let i; while ((i = this.buf.indexOf('\n\n')) !== -1) { const d = this.buf.slice(6, i); this.buf = this.buf.slice(i + 2); ev.push(d === '[DONE]' ? { done: true } : { json: JSON.parse(d) }); } return ev; },
    end() { return []; },
  };
  const peek = { status: 200, events: [{ json: chunk(DIRTY) }], finished: false, reader: readerOf([`data: ${JSON.stringify(chunk(DIRTY))}\n\n`]), parser };
  const response = new FakeResponse();
  await deliverPeek({ peek, request: { headers: {} }, response, body: { model: 'm', stream: true, messages: [] } });
  assert.ok(!response.body.includes('"timings"'));
  assert.ok(!/[\u001b\u200b\ufeff]/.test(response.body));
  assert.equal((response.body.match(/"content":"ok"/g) ?? []).length, 2);
});

test('non-stream regression: timings dropped via sanitizeCompletionJson', () => {
  const j = sanitizeCompletionJson({ choices: [{ message: { content: DIRTY } }], timings: {} });
  assert.equal(j.timings, undefined);
  assert.equal(j.choices[0].message.content, 'ok');
});

test('headerSafe strips C0 controls', () => {
  assert.ok(!/[\u0000-\u001f\u007f]/.test(headerSafe('bad\u0007reason\r\nx-inj: 1')));
});

test('tool_calls name/arguments stripped in message (non-stream)', () => {
  const args = '{"q":"a\u001b[31mb\u200bc"}';
  const j = sanitizeCompletionJson({ choices: [{ message: { tool_calls: [{ id: 't1', type: 'function', function: { name: 'se\u200barch\u001b]0;x\u0007', arguments: args } }] } }] });
  const fn = j.choices[0].message.tool_calls[0].function;
  assert.equal(fn.name, 'search');
  assert.equal(fn.arguments, '{"q":"abc"}');
  assert.equal(j.choices[0].message.tool_calls[0].id, 't1');
});

test('tool_calls name/arguments stripped in streaming delta chunks', () => {
  const chunks = [
    { choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: 't1', function: { name: 'get\ufeff_w\u001b[0m', arguments: '' } }] } }] },
    { choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: '{"city":\u200b"Par' } }] } }] },
    { choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: 'is\u001b[2J"}' } }] } }] },
  ];
  const out = chunks.map((c) => sanitizeCompletionJson(c).choices[0].delta.tool_calls[0].function);
  assert.equal(out[0].name, 'get_w');
  assert.equal(out.map((f) => f.arguments).join(''), '{"city":"Paris"}');
  const line = sanitizeSseDataLine(`data: ${JSON.stringify(chunks[1])}`);
  assert.ok(!/[\u001b\u200b\ufeff]/.test(line));
});
