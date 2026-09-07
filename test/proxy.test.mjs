import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { proxyJson } from '../src/proxy.mjs';

class FakeResponse extends EventEmitter {
  constructor() {
    super();
    this.status = null;
    this.headers = null;
    this.chunks = [];
    this.ended = false;
  }
  writeHead(status, headers) { this.status = status; this.headers = headers; }
  write(chunk) { if (chunk) this.chunks.push(Buffer.from(chunk)); return true; }
  end(chunk) { if (chunk) this.chunks.push(Buffer.from(chunk)); this.ended = true; this.emit('finish'); }
  get writableEnded() { return this.ended; }
}

test('connection refused retries before headers, then succeeds', async () => {
  let attempts = 0;
  const response = new FakeResponse();
  await proxyJson({
    request: { method: 'POST', headers: {} },
    response,
    body: { model: 'general-text-speculator', messages: [] },
    target: 'http://127.0.0.1:9/v1/chat/completions',
    config: { retry_initial_ms: 5, retry_max_ms: 10, retry_deadline_ms: 500 },
    fetchImpl: async () => {
      attempts += 1;
      if (attempts === 1) {
        const error = new Error('connect');
        error.code = 'ECONNREFUSED';
        throw error;
      }
      return {
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        body: null,
      };
    },
  });
  assert.equal(attempts, 2);
  assert.equal(response.status, 200);
});


test('content-length is not forwarded so a rewritten body can be larger', async () => {
  let sent;
  const response = new FakeResponse();
  await proxyJson({
    request: { method: 'POST', headers: { 'content-length': '10', 'x-session-id': 'abc' } },
    response,
    body: { model: 'general-text-speculator', max_tokens: 24, chat_template_kwargs: { enable_thinking: false } },
    target: 'http://127.0.0.1:9/v1/chat/completions',
    config: { retry_initial_ms: 5, retry_max_ms: 10, retry_deadline_ms: 50 },
    fetchImpl: async (_url, init) => {
      sent = init.headers;
      return { status: 200, headers: new Headers({ 'content-type': 'application/json' }), body: null };
    },
  });
  assert.equal(sent.get('content-length'), null);
  assert.equal(sent.get('x-session-id'), null);
  assert.equal(sent.get('content-type'), 'application/json');
});

test('strips timings and reasoning_content unless the client asked for thinking', async () => {
  const response = new FakeResponse();
  await proxyJson({
    request: { method: 'POST', headers: {} },
    response,
    body: { model: 'general-text-speculator', messages: [], chat_template_kwargs: { enable_thinking: false } },
    target: 'http://127.0.0.1:9/v1/chat/completions',
    config: { retry_initial_ms: 5, retry_max_ms: 10, retry_deadline_ms: 50 },
    fetchImpl: async () => ({
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      async text() {
        return JSON.stringify({
          choices: [{ message: { role: 'assistant', content: 'limerick', reasoning_content: 'inner monologue' } }],
          timings: { predicted_n: 1513 },
        });
      },
    }),
  });
  const parsed = JSON.parse(Buffer.concat(response.chunks).toString());
  assert.equal(parsed.choices[0].message.content, 'limerick');
  assert.equal(parsed.choices[0].message.reasoning_content, undefined);
  assert.equal(parsed.timings, undefined);
});

test('keeps reasoning_content when enable_thinking is true', async () => {
  const response = new FakeResponse();
  await proxyJson({
    request: { method: 'POST', headers: {} },
    response,
    body: { model: 'general-text-speculator', enable_thinking: true, messages: [] },
    target: 'http://127.0.0.1:9/v1/chat/completions',
    config: { retry_initial_ms: 5, retry_max_ms: 10, retry_deadline_ms: 50 },
    fetchImpl: async () => ({
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      async text() {
        return JSON.stringify({
          choices: [{ message: { role: 'assistant', content: 'ok', reasoning_content: 'thoughts' } }],
        });
      },
    }),
  });
  const parsed = JSON.parse(Buffer.concat(response.chunks).toString());
  assert.equal(parsed.choices[0].message.reasoning_content, 'thoughts');
});

test('strips ESC and C0 controls from completion content', async () => {
  const response = new FakeResponse();
  await proxyJson({
    request: { method: 'POST', headers: {} },
    response,
    body: { model: 'general-text-speculator', messages: [] },
    target: 'http://127.0.0.1:9/v1/chat/completions',
    config: { retry_initial_ms: 5, retry_max_ms: 10, retry_deadline_ms: 50 },
    fetchImpl: async () => ({
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      async text() {
        return JSON.stringify({
          choices: [{ message: { role: 'assistant', content: '\u001b[31mred\u001b[0m\u0007bell' } }],
        });
      },
    }),
  });
  const parsed = JSON.parse(Buffer.concat(response.chunks).toString());
  assert.equal(parsed.choices[0].message.content, 'redbell');
});

test('proxyJson returns assistant content from a JSON completion', async () => {
  const response = new FakeResponse();
  const proxied = await proxyJson({
    request: { method: 'POST', headers: {} },
    response,
    body: { model: 'general-text-speculator', messages: [] },
    target: 'http://127.0.0.1:9/v1/chat/completions',
    config: { retry_initial_ms: 5, retry_max_ms: 10, retry_deadline_ms: 50 },
    fetchImpl: async () => ({
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      async text() {
        return JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'Hello Ada' } }] });
      },
    }),
  });
  assert.equal(proxied.status, 200);
  assert.equal(proxied.content, 'Hello Ada');
});

test('proxyJson returns concatenated assistant deltas from an SSE stream', async () => {
  const sse = [
    `data: ${JSON.stringify({ choices: [{ delta: { content: 'Hello ' } }] })}`,
    '',
    `data: ${JSON.stringify({ choices: [{ delta: { content: 'Ada' } }] })}`,
    '',
    'data: [DONE]',
    '',
  ].join('\n');
  const buf = new TextEncoder().encode(sse);
  const response = new FakeResponse();
  const proxied = await proxyJson({
    request: { method: 'POST', headers: {} },
    response,
    body: { model: 'general-text-speculator', stream: true, messages: [] },
    target: 'http://127.0.0.1:9/v1/chat/completions',
    config: { retry_initial_ms: 5, retry_max_ms: 10, retry_deadline_ms: 50 },
    fetchImpl: async () => ({
      status: 200,
      headers: new Headers({ 'content-type': 'text/event-stream' }),
      body: {
        getReader() {
          let sent = false;
          return {
            async read() {
              if (sent) return { done: true, value: undefined };
              sent = true;
              return { done: false, value: buf };
            },
            releaseLock() {},
            async cancel() {},
          };
        },
      },
    }),
  });
  assert.equal(proxied.status, 200);
  assert.equal(proxied.content, 'Hello Ada');
});

test('stream:true + upstream JSON completion is rewritten as SSE', async () => {
  const response = new FakeResponse();
  const proxied = await proxyJson({
    request: { method: 'POST', headers: {} },
    response,
    body: { model: 'general-text-speculator', stream: true, messages: [] },
    target: 'http://127.0.0.1:9/v1/chat/completions',
    config: { retry_initial_ms: 5, retry_max_ms: 10, retry_deadline_ms: 50 },
    fetchImpl: async () => ({
      status: 200,
      headers: new Headers({ 'content-type': 'application/json; charset=utf-8' }),
      async text() {
        return JSON.stringify({
          id: 'chatcmpl-test',
          object: 'chat.completion',
          model: 'general-text-speculator',
          choices: [{ index: 0, message: { role: 'assistant', content: 'HELLO!' }, finish_reason: 'stop' }],
        });
      },
    }),
  });
  const body = Buffer.concat(response.chunks).toString();
  assert.equal(proxied.status, 200);
  assert.equal(proxied.content, 'HELLO!');
  assert.match(response.headers['content-type'], /text\/event-stream/);
  assert.match(body, /data: /);
  assert.match(body, /HELLO!/);
  assert.match(body, /\[DONE\]/);
});
