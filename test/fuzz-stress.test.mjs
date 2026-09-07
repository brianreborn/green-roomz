/**
 * Light fuzz / stress tests, separate from domain routing tests.
 * Bounded iterations, stubbed llama, no soak. Goal: crashes, hangs, 500s,
 * header injection, parser blow-ups — not "did /code route to code".
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { AgentRegistry } from '../src/registry.mjs';
import { ProcessManager } from '../src/process-manager.mjs';
import { PolicyGate } from '../src/scheduler.mjs';
import { SessionLedger } from '../src/sessions.mjs';
import { Gateway } from '../src/gateway.mjs';
import { parseHandoffContent } from '../src/handoff.mjs';
import { parseRouteJson } from '../src/nexus.mjs';
import { parseSlashCommand, stripSlashCommand } from '../src/routing.mjs';
import { Mailbox } from '../src/mailbox.mjs';
import { HOT_RING_SLOTS, MonitorIpc } from '../src/monitor/ipc.mjs';
import { sampleManifest } from './helpers.mjs';

const HEADER_UNSAFE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u2028\u2029]/;
const C0_C1 = /[\u0000-\u001F\u007F-\u009F]/;

function jsonFetch(payload, status = 200) {
  const json = JSON.stringify(payload);
  return {
    status,
    headers: new Headers({ 'content-type': 'application/json' }),
    async text() { return json; },
  };
}

function defaultFetch(url) {
  const href = String(url);
  if (href.includes(':18187')) {
    return jsonFetch({
      choices: [{
        message: {
          role: 'assistant',
          content: JSON.stringify({ route: 'general-text-speculator', confidence: 0.8, reason: 'nexus' }),
        },
      }],
    });
  }
  return jsonFetch({ choices: [{ message: { role: 'assistant', content: 'stub' } }] });
}

async function withServer(t, extras = {}) {
  const previous = { ...process.env };
  if (extras.env) Object.assign(process.env, extras.env);
  const manifest = sampleManifest(extras.manifestOverrides ?? {});
  const registry = await new AgentRegistry(manifest).inspect();
  const ready = extras.ready ?? ['qwenstral-code-speculator', 'general-text-speculator', 'tool-router-agent'];
  for (const alias of ready) registry.setStatus(alias, 'ready');
  const hostAdapter = extras.hostAdapter ?? { sampleResources() { return { freeMemoryBytes: 1 }; } };
  const processes = new ProcessManager({
    manifest,
    registry,
    hostAdapter,
    spawnImpl() { throw new Error('should not spawn in this test'); },
  });
  processes.ensure = async (agent) => ({ alias: agent.alias, state: 'ready' });
  const gateway = new Gateway({
    manifest,
    registry,
    processes,
    sessions: extras.sessions ?? new SessionLedger(),
    policy: extras.policy ?? new PolicyGate('maximize'),
    hostAdapter,
    fetchImpl: extras.fetchImpl ?? defaultFetch,
  });
  const server = await gateway.listen('127.0.0.1', 0);
  t.after(() => {
    server.close();
    for (const key of Object.keys(process.env)) {
      if (!(key in previous)) delete process.env[key];
    }
    Object.assign(process.env, previous);
  });
  return { server, gateway, registry, processes };
}

function rawRequest(server, { path, method = 'POST', headers = {}, body, timeout = 4000 } = {}) {
  const { port } = server.address();
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path,
      method,
      headers: { connection: 'close', ...headers },
      family: 4,
      timeout,
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString() || '';
        let parsed;
        try { parsed = JSON.parse(raw || 'null'); } catch { parsed = raw; }
        finish({ status: res.statusCode, headers: res.headers, body: parsed, raw });
      });
    });
    req.on('error', (error) => finish({ status: 0, headers: {}, body: null, raw: '', error }));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`request timeout ${method} ${path}`));
    });
    if (body != null) req.write(body);
    req.end();
  });
}

function assertHeaderSafe(headers, label) {
  for (const [key, value] of Object.entries(headers ?? {})) {
    const text = Array.isArray(value) ? value.join(',') : String(value ?? '');
    assert.equal(HEADER_UNSAFE.test(key), false, `${label} header name ${key}`);
    assert.equal(HEADER_UNSAFE.test(text), false, `${label} header ${key}`);
  }
  assert.equal(headers['x-injected'], undefined, `${label} injected header`);
}

function assertNotServerError(result, label) {
  assert.notEqual(result.status, 500, `${label} status=${result.status} body=${String(result.raw ?? '').slice(0, 180)}`);
  assert.ok(result.status === 0 || result.status < 500, `${label} status=${result.status}`);
  if (result.status) assertHeaderSafe(result.headers, label);
}

const MIXED_MEDIA = {
  messages: [{
    role: 'user',
    content: [
      { type: 'image_url', image_url: { url: 'data:image/png;base64,xxxx' } },
      { type: 'input_audio', input_audio: { data: 'data:audio/wav;base64,xxxx' } },
    ],
  }],
};

test('fuzz: gateway HTTP corpus does not 500, hang, or inject headers', async (t) => {
  const { server } = await withServer(t);
  const chat = '/v1/chat/completions';
  const cases = [
    { name: 'control-hello', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'user', content: 'hello' }] }) },
    { name: 'malformed-json', headers: { 'content-type': 'application/json' }, body: '{"messages":[' },
    { name: 'truncated-json', headers: { 'content-type': 'application/json' }, body: '{"messages":[{"role":"user","content":"hi"}' },
    { name: 'json-null', headers: { 'content-type': 'application/json' }, body: 'null' },
    { name: 'json-array', headers: { 'content-type': 'application/json' }, body: '[]' },
    { name: 'json-string', headers: { 'content-type': 'application/json' }, body: '"hello"' },
    { name: 'json-number', headers: { 'content-type': 'application/json' }, body: '1e309' },
    { name: 'empty-body', headers: { 'content-type': 'application/json' }, body: '' },
    { name: 'wrong-type-form', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'foo=bar&model=general-text-speculator' },
    { name: 'wrong-type-text-valid-json', headers: { 'content-type': 'text/plain' }, body: JSON.stringify({ messages: [{ role: 'user', content: 'hello' }] }) },
    { name: 'no-content-type', headers: {}, body: JSON.stringify({ messages: [{ role: 'user', content: 'hello' }] }) },
    { name: 'invalid-utf8', headers: { 'content-type': 'application/json' }, body: Buffer.from([0xff, 0xfe, 0x00, 0x7b]) },
    { name: 'mixed-image-audio', headers: { 'content-type': 'application/json' }, body: JSON.stringify(MIXED_MEDIA) },
    { name: 'mixed-image-audio-route', path: `${chat}/route`, headers: { 'content-type': 'application/json' }, body: JSON.stringify(MIXED_MEDIA) },
    { name: 'huge-slash-rest', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'user', content: `/code ${'x'.repeat(4000)}` }] }) },
    { name: 'huge-unknown-slash', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'user', content: `/${'a'.repeat(2000)} rest` }] }) },
    { name: 'c0-c1-esc-user', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'user', content: `hi\u0000\u0007\u001b[31m\u009b\u001b]0;pwn\u0007\r\nX-Injected: 1` }] }) },
    { name: 'crlf-in-model', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: 'general-text-speculator\r\nX-Injected: 1', messages: [{ role: 'user', content: 'hello' }] }) },
    { name: 'nested-object', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'user', content: 'hello' }], extra: nest(24) }) },
    { name: 'messages-string', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages: 'not-an-array' }) },
  ];

  for (const item of cases) {
    const result = await rawRequest(server, {
      path: item.path ?? chat,
      headers: item.headers,
      body: item.body,
    });
    assertNotServerError(result, item.name);
  }

  const control = await rawRequest(server, {
    path: chat,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: 'hello' }] }),
  });
  assert.equal(control.status, 200, 'control hello should still succeed after corpus');
});

test('fuzz: 42-message history is not a gateway 400', async (t) => {
  let forwarded;
  const { server } = await withServer(t, {
    fetchImpl: async (url, init) => {
      const href = String(url);
      const body = JSON.parse(Buffer.from(init.body).toString());
      if (!href.includes(':18187') && Array.isArray(body.messages) && body.messages.length >= 42) {
        forwarded = body;
      }
      return defaultFetch(url);
    },
  });
  const messages = Array.from({ length: 42 }, (_, i) => ({
    role: i % 2 === 0 ? 'user' : 'assistant',
    content: `turn ${i}`,
  }));
  const result = await rawRequest(server, {
    path: '/v1/chat/completions',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages, max_tokens: 8 }),
  });
  assert.notEqual(result.status, 400, `42 messages 400 body=${String(result.raw ?? '').slice(0, 240)}`);
  assert.notEqual(result.status, 413, '42 short messages must not hit the body limit');
  assert.equal(result.status, 200);
  assert.ok(forwarded, 'specialist hop should see the 42-message history');
  assert.ok(forwarded.messages.length >= 42, `forwarded ${forwarded.messages.length} messages`);
});

test('fuzz: messages as the number 42 is validation 400, not a hang', async (t) => {
  const { server } = await withServer(t);
  const result = await rawRequest(server, {
    path: '/v1/chat/completions',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages: 42 }),
  });
  assert.equal(result.status, 400);
  assert.match(String(result.body?.error?.message ?? ''), /messages must be an array/);
});

test('fuzz: oversized body is rejected without hanging the gateway', async (t) => {
  const limit = 4096;
  const { server } = await withServer(t, { manifestOverrides: { gateway: { request_body_limit_bytes: limit } } });
  const body = Buffer.concat([
    Buffer.from('{"messages":[{"role":"user","content":"'),
    Buffer.alloc(limit + 128, 0x61),
    Buffer.from('"}]}'),
  ]);
  const result = await rawRequest(server, {
    path: '/v1/chat/completions',
    headers: { 'content-type': 'application/json', 'content-length': String(body.length) },
    body,
    timeout: 3000,
  });
  assertNotServerError(result, 'oversized');
  if (result.status) assert.ok(result.status === 400 || result.status === 413, `oversized status=${result.status}`);
  const health = await rawRequest(server, { path: '/v1/health', method: 'GET', timeout: 3000 });
  assert.equal(health.status, 200);
});

test('fuzz: nexus reason CRLF/ESC cannot inject response headers', async (t) => {
  const { server } = await withServer(t, {
    fetchImpl: async (url) => {
      const href = String(url);
      if (href.includes(':18187')) {
        return jsonFetch({
          choices: [{
            message: {
              role: 'assistant',
              content: JSON.stringify({
                route: 'general-text-speculator',
                confidence: 0.9,
                reason: 'ok\r\nX-Injected: pwn\r\nSet-Cookie: a=b\u001b[31m\u2028',
              }),
            },
          }],
        });
      }
      return jsonFetch({ choices: [{ message: { role: 'assistant', content: 'stub' } }] });
    },
  });
  for (const path of ['/v1/chat/completions', '/v1/chat/completions/route']) {
    const result = await rawRequest(server, {
      path,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'a quiet poem about rain' }] }),
    });
    assertNotServerError(result, path);
    const reason = result.headers['x-green-roomz-route-reason'] ?? '';
    assert.equal(/\r|\n/.test(reason), false, `${path} reason CRLF`);
    assert.equal(result.headers['x-injected'], undefined, `${path} x-injected`);
    assert.equal(result.headers['set-cookie'], undefined, `${path} set-cookie`);
    assert.ok(reason.length <= 240, `${path} reason length`);
  }
});

test('fuzz: concurrent chat and route requests complete without 500 or hung sockets', async (t) => {
  const { server } = await withServer(t);
  const n = 16;
  const started = Date.now();
  const jobs = Array.from({ length: n }, (_, i) => rawRequest(server, {
    path: i % 2 === 0 ? '/v1/chat/completions' : '/v1/chat/completions/route',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: `turn ${i} write a haiku` }] }),
    timeout: 4000,
  }));
  const results = await Promise.all(jobs);
  const elapsed = Date.now() - started;
  assert.ok(elapsed < 8000, `concurrent batch took ${elapsed}ms`);
  for (const [i, result] of results.entries()) {
    assertNotServerError(result, `concurrent-${i}`);
    assert.ok(result.status === 200 || result.status === 400 || result.status === 422, `concurrent-${i} status=${result.status}`);
  }
});

test('fuzz: parseRouteJson sandwich, nested braces, first-JSON-only, OSC/CSI', () => {
  const first = { route: 'general-text-speculator', confidence: 0.9, reason: 'first' };
  const second = { route: 'qwenstral-code-speculator', confidence: 0.1, reason: 'second' };
  const sandwich = `prefix ${JSON.stringify(first)} junk ${JSON.stringify(second)}`;
  const parsed = parseRouteJson(sandwich);
  assert.equal(parsed.route, 'general-text-speculator');
  assert.equal(parsed.reason, 'first');

  const nested = parseRouteJson(JSON.stringify({
    route: 'general-text-speculator',
    confidence: 1,
    reason: 'has { nested { braces } } inside',
  }));
  assert.equal(nested.route, 'general-text-speculator');
  assert.match(nested.reason, /nested/);

  const fenced = parseRouteJson(`\`\`\`json\n${JSON.stringify(first)}\n\`\`\`\n${JSON.stringify(second)}`);
  assert.equal(fenced.route, 'general-text-speculator');

  const unclosed = parseRouteJson(`{"route":"general-text-speculator","reason":"${'x'.repeat(2000)}`);
  assert.equal(unclosed, null);

  const braces = parseRouteJson('{'.repeat(4000));
  assert.equal(braces, null);

  const osc = parseRouteJson(JSON.stringify({
    route: 'general-text-speculator',
    confidence: 1,
    reason: '\u001b]0;pwn\u0007\u001b[31mred',
  }));
  assert.equal(osc.route, 'general-text-speculator');
  assert.equal(typeof osc.reason, 'string');

  assert.equal(parseRouteJson(undefined), null);
  assert.equal(parseRouteJson(''), null);
  assert.doesNotThrow(() => parseRouteJson('\u0000{"route":"general-text-speculator"}'));
});

test('fuzz: parseHandoffContent sandwich, unallowlisted suggest, OSC/CSI', () => {
  const sandwich = '{"handoff":true,"reason":"first","suggest":"general-text-speculator"}{"handoff":true,"reason":"second","suggest":"qwenstral-code-speculator"}';
  const parsed = parseHandoffContent(sandwich);
  assert.equal(parsed?.handoff, true);
  assert.equal(parsed.reason, 'first');
  assert.equal(parsed.suggest, 'general-text-speculator');

  const trailing = parseHandoffContent('HANDOFF {"reason":"ok","suggest":"general-text-speculator"} extra {"suggest":"qwenstral-code-speculator"}');
  assert.equal(trailing.handoff, true);
  assert.equal(trailing.reason, 'ok');
  assert.equal(trailing.suggest, 'general-text-speculator');

  const nested = parseHandoffContent('HANDOFF {"reason":"has {nested} braces","suggest":"general-text-speculator"}');
  assert.equal(nested.suggest, 'general-text-speculator');
  assert.match(nested.reason, /nested/);

  const badSuggest = [
    'HANDOFF {"reason":"x","suggest":"../etc/passwd"}',
    'HANDOFF {"reason":"x","suggest":"auto"}',
    'HANDOFF {"reason":"x","suggest":"tool-router-agent"}',
    'HANDOFF {"reason":"x","suggest":"DROP TABLE agents"}',
    `HANDOFF {"reason":"x","suggest":"${'a'.repeat(80)}"}`,
  ];
  for (const text of badSuggest) {
    const handoff = parseHandoffContent(text);
    assert.equal(handoff.handoff, true, text);
    assert.equal(handoff.suggest, null, text);
  }

  const osc = parseHandoffContent('HANDOFF {"reason":"\u001b]0;pwn\u0007\u001b[31mred\r\nX-Injected: 1","suggest":"general-text-speculator"}');
  assert.equal(osc.handoff, true);
  assert.equal(C0_C1.test(osc.reason), false, `reason still has controls: ${JSON.stringify(osc.reason)}`);
  assert.equal(/\r|\n/.test(osc.reason), false);

  assert.doesNotThrow(() => parseHandoffContent('HANDOFF ' + '{'.repeat(3000)));
  assert.equal(parseHandoffContent(undefined), null);
});

test('fuzz: mailbox burst drop-oldest, recent(0), concurrent drain/push', async () => {
  const box = new Mailbox({ capacity: 8, autoDrain: false, recentLimit: 16 });
  for (let i = 0; i < 40; i += 1) box.push({ kind: 'success', source: 'fuzz', payload: { i } });
  const stats = box.stats();
  assert.equal(stats.capacity, 8);
  assert.equal(stats.size, 8);
  assert.equal(stats.pushed, 40);
  assert.equal(stats.dropped, 32);
  const drained = box.drain();
  assert.equal(drained.length, 8);
  assert.equal(drained[0].payload.i, 32);
  assert.equal(drained.at(-1).payload.i, 39);
  const after = box.stats();
  assert.equal(after.size, 0);
  assert.equal(after.pushed, after.drained + after.dropped + after.size);

  box.push({ kind: 'hop', source: 'recent0', payload: { keep: true } });
  assert.ok(box.recent().length > 0);
  // slice(-0) === slice(0); recent(0) must stay empty
  assert.equal(box.recent(0).length, 0);
  assert.equal(box.recent(-1).length, 0);

  const mixed = new Mailbox({ capacity: 16, autoDrain: false, recentLimit: 32 });
  let extra = 0;
  mixed.onEvent(() => {
    if (extra < 4) {
      extra += 1;
      mixed.push({ kind: 'success', source: 'reenter', payload: { extra } });
    }
  });
  const workers = [
    ...Array.from({ length: 8 }, (_, w) => (async () => {
      for (let i = 0; i < 24; i += 1) {
        mixed.push({ kind: 'hop', source: `w${w}`, payload: { i } });
        if (i % 3 === 0) await Promise.resolve();
      }
    })()),
    ...Array.from({ length: 4 }, () => (async () => {
      for (let i = 0; i < 16; i += 1) {
        mixed.drain();
        await Promise.resolve();
      }
    })()),
  ];
  await Promise.all(workers);
  mixed.drain();
  const end = mixed.stats();
  assert.equal(end.size, 0);
  assert.equal(end.pushed, end.drained + end.dropped + end.size);
  assert.ok(end.pushed >= 8 * 24);
});

test('fuzz: ipc ring burst drop-oldest, recent(0), concurrent drain/push', async () => {
  const ipc = new MonitorIpc({ autoDrain: false, recentLimit: 32 });
  const extra = 20;
  for (let i = 0; i < HOT_RING_SLOTS + extra; i += 1) {
    ipc.push({ kind: 'hop', source: 'flood', ticket: `t${i}`, payload: { i } });
  }
  const hot = ipc.stats().hot;
  assert.equal(hot.capacity, HOT_RING_SLOTS);
  assert.equal(hot.size, HOT_RING_SLOTS);
  assert.equal(hot.dropped, extra);
  assert.equal(hot.pushed, HOT_RING_SLOTS + extra);
  assert.equal(ipc.peekHot()[0].payload.i, extra);

  ipc.push({ kind: 'success', source: 'recent0', ticket: 'keep' });
  assert.ok(ipc.recent().length > 0);
  assert.equal(ipc.recent(0).length, 0);
  assert.equal(ipc.recent(-1).length, 0);

  const live = new MonitorIpc({ autoDrain: false, recentLimit: 16 });
  const jobs = [
    ...Array.from({ length: 8 }, (_, w) => (async () => {
      for (let i = 0; i < 20; i += 1) {
        live.push({ kind: 'hop', source: `w${w}`, ticket: `t-${w}-${i}`, payload: { i } });
        if (i % 4 === 0) await Promise.resolve();
      }
    })()),
    ...Array.from({ length: 4 }, () => (async () => {
      for (let i = 0; i < 12; i += 1) {
        live.drain();
        await Promise.resolve();
      }
    })()),
  ];
  await Promise.all(jobs);
  live.drain();
  assert.ok(live.stats().hot.size <= HOT_RING_SLOTS);
  assert.equal(live.recent(0).length, 0);
});

test('fuzz: slash parser fence, unknown tokens, empty rest, array parts', () => {
  assert.equal(parseSlashCommand({ messages: [{ role: 'user', content: '```\n/code sneak\n```' }] }), null);
  assert.equal(parseSlashCommand({ messages: [{ role: 'user', content: '```json\n/text hi\n```' }] }), null);
  assert.equal(parseSlashCommand({ messages: [{ role: 'user', content: [{ type: 'text', text: '```\n/code sneak\n```' }] }] }), null);

  assert.equal(parseSlashCommand({ messages: [{ role: 'user', content: '/notatoken leftover' }] }), null);
  assert.equal(parseSlashCommand({ messages: [{ role: 'user', content: '/123' }] }), null);
  assert.equal(parseSlashCommand({ messages: [{ role: 'user', content: '/' }] }), null);
  assert.equal(parseSlashCommand({ messages: [{ role: 'user', content: '/code-extra' }] }), null);

  const empty = parseSlashCommand({ messages: [{ role: 'user', content: '/code' }] });
  assert.equal(empty.token, 'code');
  assert.equal(empty.rest, '');
  const padded = parseSlashCommand({ messages: [{ role: 'user', content: '/code   ' }] });
  assert.equal(padded.rest, '');
  const stripped = stripSlashCommand({ messages: [{ role: 'user', content: '/code' }] });
  assert.equal(stripped.messages[0].content, '');

  const parts = parseSlashCommand({
    messages: [{ role: 'user', content: [{ type: 'text', text: '/text hello' }, { type: 'text', text: 'keep' }] }],
  });
  assert.equal(parts.token, 'text');
  assert.equal(parts.rest, 'hello');
  const afterBlank = parseSlashCommand({
    messages: [{ role: 'user', content: [{ type: 'text', text: '  ' }, { type: 'text', text: '/code foo' }] }],
  });
  assert.equal(afterBlank.token, 'code');
  assert.equal(afterBlank.rest, 'foo');

  const unknownBody = { messages: [{ role: 'user', content: '/nope leftover' }] };
  assert.equal(stripSlashCommand(unknownBody), unknownBody);

  assert.doesNotThrow(() => parseSlashCommand(null));
  assert.doesNotThrow(() => parseSlashCommand({ messages: [{ role: 'user', content: 12 }] }));
  assert.doesNotThrow(() => parseSlashCommand({ messages: [{ role: 'user', content: `/${'z'.repeat(1500)}` }] }));
  assert.equal(parseSlashCommand({ messages: [{ role: 'user', content: `/${'z'.repeat(1500)}` }] }), null);
});

function nest(depth) {
  let value = { leaf: true };
  for (let i = 0; i < depth; i += 1) value = { child: value };
  return value;
}
