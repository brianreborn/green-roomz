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
  end(chunk) { if (chunk) this.chunks.push(chunk); this.ended = true; this.emit('finish'); }
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
  assert.equal(sent.get('x-session-id'), 'abc');
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
