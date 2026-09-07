import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AgentRegistry } from '../src/registry.mjs';
import { ProcessManager } from '../src/process-manager.mjs';
import { PolicyGate } from '../src/scheduler.mjs';
import { SessionLedger } from '../src/sessions.mjs';
import { Gateway, prepareInferenceBody } from '../src/gateway.mjs';
import { sampleManifest } from './helpers.mjs';
import { REQUIRED_ALIASES } from '../src/constants.mjs';

async function withServer(t, env = {}, extras = {}) {
  const previous = { ...process.env };
  Object.assign(process.env, env);
  const manifest = sampleManifest();
  const registry = await new AgentRegistry(manifest).inspect();
  for (const alias of extras.ready ?? []) registry.setStatus(alias, 'ready');
  const hostAdapter = extras.hostAdapter ?? { sampleResources() { return { freeMemoryBytes: 1 }; } };
  const processes = new ProcessManager({ manifest, registry, hostAdapter, spawnImpl() { throw new Error('should not spawn in this test'); } });
  if (extras.stubEnsure) {
    processes.ensure = async (agent) => ({ alias: agent.alias, state: 'ready' });
  }
  const gateway = new Gateway({
    manifest,
    registry,
    processes,
    sessions: extras.sessions ?? new SessionLedger(),
    policy: new PolicyGate('maximize'),
    hostAdapter,
    fetchImpl: extras.fetchImpl,
  });
  const server = await gateway.listen('127.0.0.1', 0);
  t.after(async () => {
    server.close();
    for (const key of Object.keys(process.env)) {
      if (!(key in previous)) delete process.env[key];
    }
    Object.assign(process.env, previous);
  });
  return { server, gateway, registry, processes };
}

function request(server, { path, method = 'GET', headers = {}, body } = {}) {
  const { port } = server.address();
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path, method, headers, family: 4, timeout: 5000 }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: JSON.parse(Buffer.concat(chunks).toString() || 'null'),
      }));
    });
    req.on('error', reject); req.on('timeout', () => { req.destroy(new Error('request timeout')); });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function jsonFetch(payload, status = 200) {
  const json = JSON.stringify(payload);
  return {
    status,
    headers: new Headers({ 'content-type': 'application/json' }),
    async text() { return json; },
  };
}

function sseFetch(parts) {
  const frames = (Array.isArray(parts) ? parts : [parts]).map((part) => (
    `data: ${JSON.stringify({ choices: [{ delta: { content: part } }] })}\n\n`
  ));
  frames.push('data: [DONE]\n\n');
  const buf = new TextEncoder().encode(frames.join(''));
  return {
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
  };
}

function rawRequest(server, { path, method = 'POST', headers = {}, body } = {}) {
  const { port } = server.address();
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path, method, headers, family: 4, timeout: 5000 }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        raw: Buffer.concat(chunks).toString(),
      }));
    });
    req.on('error', reject); req.on('timeout', () => { req.destroy(new Error('request timeout')); });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

test('health is degraded when artifacts are missing and models stay truthful', async (t) => {
  const { server } = await withServer(t);
  const health = await request(server, { path: '/v1/health' });
  assert.equal(health.status, 200);
  assert.equal(health.body.status, 'degraded');
  const vision = health.body.agents.find((agent) => agent.id === 'vision-layout-agent');
  assert.deepEqual(vision.native_capabilities, ['text', 'image']);
  const models = await request(server, { path: '/v1/models' });
  assert.equal(models.body.data.length, REQUIRED_ALIASES.length);
});

test('health is ok when health_aliases are ready even if vision is missing', async (t) => {
  const { server } = await withServer(t, {}, { ready: ['tool-router-agent', 'general-text-speculator'] });
  const health = await request(server, { path: '/v1/health' });
  assert.equal(health.status, 200);
  assert.equal(health.body.status, 'ok');
  const vision = health.body.agents.find((agent) => agent.id === 'vision-layout-agent');
  assert.equal(vision.availability, 'unavailable');
  assert.equal(health.body.unavailable_required.length, 0);
});

test('logical router returns a plan only when route_plan_only is set', async (t) => {
  const { server } = await withServer(t);
  const result = await request(server, {
    path: '/v1/chat/completions',
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: { model: 'tool-router-agent', route_plan_only: true, messages: [{ role: 'user', content: 'summarize this paragraph' }] },
  });
  assert.equal(result.status, 200);
  const plan = JSON.parse(result.body.choices[0].message.content);
  assert.equal(plan.route, 'general-text-speculator');
  assert.ok(result.headers['x-session-id']);
});

test('path ending in /route returns the plan JSON', async (t) => {
  const { server } = await withServer(t);
  const result = await request(server, {
    path: '/v1/chat/completions/route',
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: { messages: [{ role: 'user', content: 'write a python function' }] },
  });
  assert.equal(result.status, 200);
  const plan = JSON.parse(result.body.choices[0].message.content);
  assert.equal(plan.route, 'qwenstral-code-speculator');
  assert.equal(plan.reason_code, 'code_intent');
});

test('tool-router python-function prompt proxies to qwenstral-code-speculator, not a plan JSON', async (t) => {
  let captured;
  const { server } = await withServer(t, {}, {
    ready: ['qwenstral-code-speculator'],
    stubEnsure: true,
    fetchImpl: async (url, init) => {
      captured = { url, body: JSON.parse(Buffer.from(init.body).toString()) };
      return jsonFetch({
        id: 'mock',
        object: 'chat.completion',
        model: 'qwenstral-code-speculator',
        choices: [{ index: 0, message: { role: 'assistant', content: 'def hello():\n    return 1\n', reasoning_content: 'thinking dump' }, finish_reason: 'stop' }],
        timings: { predicted_n: 9 },
      });
    },
  });
  const result = await request(server, {
    path: '/v1/chat/completions',
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: { model: 'tool-router-agent', messages: [{ role: 'user', content: 'write a python function named hello' }] },
  });
  assert.equal(result.status, 200);
  assert.equal(result.headers['x-green-roomz-effective-alias'], 'qwenstral-code-speculator');
  assert.equal(result.body.choices[0].message.content.includes('def hello'), true);
  assert.equal(result.body.choices[0].message.reasoning_content, undefined);
  assert.equal(result.body.timings, undefined);
  assert.match(String(captured.url), /18183/);
  assert.equal(captured.body.model, 'qwenstral-code-speculator');
  assert.doesNotMatch(result.body.choices[0].message.content, /reason_code/);
});

test('omitted model with a python function proxies to the code alias', async (t) => {
  const { server } = await withServer(t, {}, {
    ready: ['qwenstral-code-speculator'],
    stubEnsure: true,
    fetchImpl: async () => jsonFetch({
      choices: [{ message: { role: 'assistant', content: 'def add(a, b):\n    return a + b\n' } }],
    }),
  });
  const result = await request(server, {
    path: '/v1/chat/completions',
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: { messages: [{ role: 'user', content: 'write a python function that adds' }] },
  });
  assert.equal(result.headers['x-green-roomz-effective-alias'], 'qwenstral-code-speculator');
  assert.match(result.body.choices[0].message.content, /def add/);
});

test('pinned general-text C++ program still proxies to the code alias', async (t) => {
  const { server } = await withServer(t, {}, {
    ready: ['qwenstral-code-speculator', 'general-text-speculator'],
    stubEnsure: true,
    fetchImpl: async () => jsonFetch({
      choices: [{ message: { role: 'assistant', content: '#include <iostream>\nint main() { return 0; }\n' } }],
    }),
  });
  const result = await request(server, {
    path: '/v1/chat/completions',
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: { model: 'general-text-speculator', messages: [{ role: 'user', content: 'generate a small limerick-like C++ program' }] },
  });
  assert.equal(result.headers['x-green-roomz-effective-alias'], 'qwenstral-code-speculator');
  assert.match(result.body.choices[0].message.content, /iostream|int main/);
});

test('session started on general-text switches to code on a python function', async (t) => {
  const sessions = new SessionLedger();
  const { server } = await withServer(t, {}, {
    sessions,
    ready: ['qwenstral-code-speculator', 'general-text-speculator'],
    stubEnsure: true,
    fetchImpl: async (_url, init) => {
      const body = JSON.parse(Buffer.from(init.body).toString());
      const content = body.model === 'qwenstral-code-speculator' ? 'def foo():\n    pass\n' : 'a limerick about noodles';
      return jsonFetch({ choices: [{ message: { role: 'assistant', content } }] });
    },
  });
  const first = await request(server, {
    path: '/v1/chat/completions',
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: { model: 'general-text-speculator', messages: [{ role: 'user', content: 'Make up a limerick about noodles.' }] },
  });
  assert.equal(first.headers['x-green-roomz-effective-alias'], 'general-text-speculator');
  const sid = first.headers['x-session-id'];
  const second = await request(server, {
    path: '/v1/chat/completions',
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-session-id': sid },
    body: { model: 'general-text-speculator', messages: [{ role: 'user', content: 'write a python function named noodles' }] },
  });
  assert.equal(second.headers['x-green-roomz-effective-alias'], 'qwenstral-code-speculator');
  assert.match(second.body.choices[0].message.content, /def /);
});

test('explicit translate prompt proxies to general-text-speculator', async (t) => {
  const { server } = await withServer(t, {}, {
    ready: ['general-text-speculator', 'qwenstral-code-speculator'],
    stubEnsure: true,
    fetchImpl: async () => jsonFetch({
      choices: [{ message: { role: 'assistant', content: 'Hello world' } }],
    }),
  });
  const result = await request(server, {
    path: '/v1/chat/completions',
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: { messages: [{ role: 'user', content: 'Please translate this sentence to English: Bonjour' }] },
  });
  assert.equal(result.headers['x-green-roomz-effective-alias'], 'general-text-speculator');
  assert.equal(result.body.choices[0].message.content, 'Hello world');
});

test('public bind is rejected without explicit security flags', async () => {
  const manifest = sampleManifest();
  const registry = new AgentRegistry(manifest);
  const gateway = new Gateway({
    manifest,
    registry,
    processes: new ProcessManager({ manifest, registry }),
    sessions: new SessionLedger(),
    policy: new PolicyGate('maximize'),
  });
  delete process.env.GREEN_ROOMZ_API_KEY;
  delete process.env.GREEN_ROOMZ_ALLOW_PUBLIC;
  assert.throws(() => gateway.bindAddress('0.0.0.0'), /GREEN_ROOMZ_ALLOW_PUBLIC=1/);
  assert.throws(() => gateway.bindAddress('::'), /GREEN_ROOMZ_ALLOW_PUBLIC=1/);
  assert.throws(() => gateway.bindAddress('::0'), /GREEN_ROOMZ_ALLOW_PUBLIC=1/);
  assert.throws(() => gateway.bindAddress(''), /GREEN_ROOMZ_ALLOW_PUBLIC=1/);
});

test('bearer auth is required when an API key is configured', async (t) => {
  const { server } = await withServer(t, { GREEN_ROOMZ_API_KEY: 'test-key' });
  const denied = await request(server, { path: '/v1/health' });
  assert.equal(denied.status, 401);
  const ok = await request(server, { path: '/v1/health', headers: { authorization: 'Bearer test-key' } });
  assert.equal(ok.status, 200);
});

test('unknown paths are 404 rather than proxied', async (t) => {
  const { server } = await withServer(t);
  const result = await request(server, { path: '/evil' });
  assert.equal(result.status, 404);
});

test('GET / is an operator HTML index, not JSON 404', async (t) => {
  const { server } = await withServer(t);
  const { port } = server.address();
  const res = await new Promise((resolve, reject) => {
    http.get({ hostname: '127.0.0.1', port, path: '/', family: 4, timeout: 5000 }, (r) => {
      const chunks = [];
      r.on('data', (chunk) => chunks.push(chunk));
      r.on('end', () => resolve({
        status: r.statusCode,
        type: r.headers['content-type'],
        body: Buffer.concat(chunks).toString(),
      }));
    }).on('error', reject);
  });
  assert.equal(res.status, 200);
  assert.match(String(res.type), /text\/html/);
  assert.match(res.body, /OpenAI-compatible/);
  assert.match(res.body, /127\.0\.0\.1/);
});

test('TLS ClientHello is dropped instead of HTTP 400', async (t) => {
  const { server } = await withServer(t);
  const { port } = server.address();
  const data = await new Promise((resolve, reject) => {
    const socket = net.connect({ host: '127.0.0.1', port, family: 4 }, () => {
      socket.write(Buffer.from('160301000100', 'hex'));
    });
    const chunks = [];
    socket.on('data', (chunk) => chunks.push(chunk));
    socket.on('close', () => resolve(Buffer.concat(chunks)));
    socket.on('error', () => resolve(Buffer.concat(chunks)));
    socket.setTimeout(2000, () => {
      socket.destroy();
      resolve(Buffer.concat(chunks));
    });
    t.after(() => socket.destroy());
  });
  assert.equal(data.length, 0, `expected RST/close, got ${data.toString('utf8')}`);
});

test('general-text thinking is off by default including max_tokens 256; explicit true is preserved', () => {
  const agent = { alias: 'general-text-speculator' };
  const short = prepareInferenceBody({ max_tokens: 24, messages: [] }, agent);
  assert.equal(short.chat_template_kwargs.enable_thinking, false);
  const normal = prepareInferenceBody({ max_tokens: 256, messages: [] }, agent);
  assert.equal(normal.chat_template_kwargs.enable_thinking, false);
  const explicit = prepareInferenceBody({ max_tokens: 256, enable_thinking: true, messages: [] }, agent);
  assert.equal(explicit.enable_thinking, true);
  assert.equal(explicit.chat_template_kwargs, undefined);
  const kwargs = prepareInferenceBody({ max_tokens: 256, chat_template_kwargs: { enable_thinking: true }, messages: [] }, agent);
  assert.equal(kwargs.chat_template_kwargs.enable_thinking, true);
  const code = prepareInferenceBody({ max_tokens: 256, messages: [] }, { alias: 'qwenstral-code-speculator' });
  assert.equal(code.enable_thinking, false);
  assert.equal(code.chat_template_kwargs.enable_thinking, false);
});

test('nexus thinking is always off even if the client asked', () => {
  const forced = prepareInferenceBody({ max_tokens: 64, enable_thinking: true, messages: [] }, { alias: 'tool-router-agent' });
  assert.equal(forced.enable_thinking, false);
  assert.equal(forced.chat_template_kwargs.enable_thinking, false);
});

test('streamed chat_default records assistant text into session memory', async (t) => {
  const sessions = new SessionLedger();
  const seen = [];
  const { server } = await withServer(t, {}, {
    sessions,
    ready: ['general-text-speculator'],
    stubEnsure: true,
    fetchImpl: async (_url, init) => {
      const body = JSON.parse(Buffer.from(init.body).toString());
      seen.push(body);
      if (body.stream) return sseFetch(['Hello ', 'Ada']);
      return jsonFetch({ choices: [{ message: { role: 'assistant', content: 'ok' } }] });
    },
  });
  const first = await rawRequest(server, {
    path: '/v1/chat/completions',
    headers: { 'content-type': 'application/json' },
    body: {
      model: 'general-text-speculator',
      stream: true,
      messages: [{ role: 'user', content: 'My name is Ada' }],
    },
  });
  assert.equal(first.status, 200);
  assert.equal(first.headers['x-green-roomz-route-reason'], 'chat_default');
  const sid = first.headers['x-session-id'];
  const stored = sessions.get(sid, 'loopback-dev');
  assert.match(stored.transcript.map((turn) => turn.text).join('\n'), /Hello Ada/);
  const second = await request(server, {
    path: '/v1/chat/completions',
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-session-id': sid },
    body: {
      model: 'general-text-speculator',
      messages: [{ role: 'user', content: 'what did I call myself?' }],
    },
  });
  assert.equal(second.status, 200);
  assert.ok(seen.length >= 2);
  assert.match(JSON.stringify(seen.at(-1).messages), /Hello Ada/);
});

test('second turn with only the latest user message still injects session facts', async (t) => {
  const seen = [];
  const { server } = await withServer(t, {}, {
    ready: ['general-text-speculator'],
    stubEnsure: true,
    fetchImpl: async (_url, init) => {
      const body = JSON.parse(Buffer.from(init.body).toString());
      seen.push(body);
      return jsonFetch({ choices: [{ message: { role: 'assistant', content: 'ok' } }] });
    },
  });
  const first = await request(server, {
    path: '/v1/chat/completions',
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: {
      model: 'general-text-speculator',
      lock_alias: true,
      messages: [{ role: 'user', content: 'My name is Ada' }],
    },
  });
  assert.equal(first.status, 200);
  const sid = first.headers['x-session-id'];
  assert.ok(sid);
  const second = await request(server, {
    path: '/v1/chat/completions',
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-session-id': sid },
    body: {
      model: 'general-text-speculator',
      lock_alias: true,
      messages: [{ role: 'user', content: 'what did I call myself?' }],
    },
  });
  assert.equal(second.status, 200);
  assert.ok(seen.length >= 2, `expected two specialist bodies, got ${seen.length}`);
  const blob = JSON.stringify(seen.at(-1).messages);
  assert.match(blob, /Ada/);
  assert.match(blob, /what did I call myself/);
  assert.match(String(second.headers['x-green-roomz-memory'] ?? ''), /facts=1/);
});

test('system policy is prepended even when the client already sent a system message', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'grz-policy-'));
  const policyPath = path.join(dir, 'general-text.md');
  writeFileSync(policyPath, 'Be concise.\n');
  const agent = { alias: 'general-text-speculator', system_policy: policyPath };
  const added = prepareInferenceBody({ messages: [{ role: 'user', content: 'hi' }] }, agent);
  assert.equal(added.messages[0].role, 'system');
  assert.match(added.messages[0].content, /Be concise\./);
  assert.match(added.messages[0].content, /# Memory/);
  assert.equal(added.messages[1].content, 'hi');
  const kept = prepareInferenceBody({
    messages: [{ role: 'system', content: 'already' }, { role: 'user', content: 'hi' }],
  }, agent);
  assert.match(kept.messages[0].content, /Be concise\./);
  assert.equal(kept.messages[1].content, 'already');
  assert.equal(kept.messages.length, 3);
});

test('health includes mailbox stats and GET /v1/monitor/recent is cheap', async (t) => {
  const { server } = await withServer(t);
  const health = await request(server, { path: '/v1/health' });
  assert.equal(typeof health.body.mailbox.capacity, 'number');
  assert.equal(typeof health.body.mailbox.pushed, 'number');
  assert.equal(health.body.ipc.copyOnly, true);
  assert.equal(typeof health.body.ipc.hot.pushed, 'number');
  const recent = await request(server, { path: '/v1/monitor/recent' });
  assert.equal(recent.status, 200);
  assert.ok(Array.isArray(recent.body.data));
  assert.equal(typeof recent.body.stats.dropped, 'number');
  assert.ok(Array.isArray(recent.body.ipc.data));
  assert.equal(typeof recent.body.ipc.stats.hot.pushed, 'number');
});

test('completion hop pushes to mailbox without awaiting drain', async (t) => {
  const { server, gateway } = await withServer(t, {}, {
    ready: ['qwenstral-code-speculator'],
    stubEnsure: true,
    fetchImpl: async () => jsonFetch({
      choices: [{ message: { role: 'assistant', content: 'def hello():\n    return 1\n' } }],
    }),
  });
  const before = gateway.mailbox.stats().pushed;
  const beforeIpc = gateway.ipc.stats().hot.pushed;
  const result = await request(server, {
    path: '/v1/chat/completions',
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: { messages: [{ role: 'user', content: 'write a python function named hello' }] },
  });
  assert.equal(result.status, 200);
  assert.ok(gateway.mailbox.stats().pushed > before);
  assert.ok(gateway.ipc.stats().hot.pushed > beforeIpc);
  const last = gateway.mailbox.recent(1)[0];
  assert.equal(last.kind, 'success');
  assert.equal(last.source, 'qwenstral-code-speculator');
  assert.equal(typeof last.seq, 'number');
  assert.equal(typeof last.ticket, 'string');
  const lastIpc = gateway.ipc.recent(1)[0];
  assert.equal(lastIpc.kind, 'success');
  assert.equal(lastIpc.source, 'qwenstral-code-speculator');
});

test('POST security-monitor-agent snapshots mailbox without consulting nexus', async (t) => {
  let fetches = 0;
  const { server, gateway } = await withServer(t, {}, {
    fetchImpl: async () => {
      fetches += 1;
      throw new Error('nexus/llama must not be consulted for the monitor alias');
    },
  });
  const before = gateway.mailbox.stats().pushed;
  const beforeIpc = gateway.ipc.stats().hot.pushed;
  const result = await request(server, {
    path: '/v1/chat/completions',
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: { model: 'security-monitor-agent', messages: [{ role: 'user', content: 'snapshot' }] },
  });
  assert.equal(result.status, 200);
  assert.equal(result.headers['x-green-roomz-effective-alias'], 'security-monitor-agent');
  assert.equal(result.headers['x-green-roomz-route-reason'], 'mailbox');
  const snapshot = JSON.parse(result.body.choices[0].message.content);
  assert.equal(snapshot.runtime, 'logical');
  assert.equal(snapshot.alias, 'security-monitor-agent');
  assert.ok(gateway.mailbox.stats().pushed > before);
  assert.ok(gateway.ipc.stats().hot.pushed > beforeIpc);
  assert.equal(fetches, 0);
  const recent = await request(server, { path: '/v1/monitor/recent' });
  assert.equal(recent.status, 200);
  assert.ok(recent.body.stats.pushed > 0);
  assert.equal(recent.body.data.at(-1).source, 'security-monitor-agent');
  assert.ok(recent.body.ipc.stats.hot.pushed > 0);
  assert.equal(recent.body.ipc.data.at(-1).source, 'security-monitor-agent');
  const health = await request(server, { path: '/health' });
  assert.ok(health.body.mailbox.pushed > 0);
  assert.ok(health.body.ipc.hot.pushed > 0);
});

test('lock_alias pins a tiny prompt to the resident 0.5B nexus', async (t) => {
  const urls = [];
  const { server } = await withServer(t, {}, {
    ready: ['tool-router-agent'],
    stubEnsure: true,
    fetchImpl: async (url, init) => {
      urls.push(String(url));
      const body = JSON.parse(Buffer.from(init.body).toString());
      assert.equal(body.model, 'tool-router-agent');
      assert.equal(body.messages.some((message) => String(message.content ?? '').includes('AVAILABLE:')), false);
      assert.match(JSON.stringify(body.messages), /ping-router/);
      return jsonFetch({ choices: [{ message: { role: 'assistant', content: 'pong-from-router' } }] });
    },
  });
  const result = await request(server, {
    path: '/v1/chat/completions',
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: {
      model: 'tool-router-agent',
      lock_alias: true,
      max_tokens: 8,
      messages: [{ role: 'user', content: 'ping-router' }],
    },
  });
  assert.equal(result.status, 200);
  assert.equal(result.headers['x-green-roomz-effective-alias'], 'tool-router-agent');
  assert.equal(result.body.choices[0].message.content, 'pong-from-router');
  assert.equal(urls.length, 1);
  assert.match(urls[0], /18187/);
});

test('impractical specialist is not started; completion stays on the resident nexus', async (t) => {
  const urls = [];
  const { server, registry, processes } = await withServer(t, {}, {
    ready: ['tool-router-agent'],
    stubEnsure: true,
    fetchImpl: async (url, init) => {
      urls.push(String(url));
      assert.equal(String(url).includes(':18183'), false, 'must not hop to qwenstral-code-speculator');
      const body = JSON.parse(Buffer.from(init.body).toString());
      assert.equal(body.messages.some((message) => String(message.content ?? '').includes('AVAILABLE:')), false);
      return jsonFetch({ choices: [{ message: { role: 'assistant', content: 'resident-ok' } }] });
    },
  });
  registry.setStatus('qwenstral-code-speculator', 'unavailable', { missing: ['impractical:RAM'] });
  registry.setStatus('general-text-speculator', 'unavailable', { missing: ['impractical:RAM'] });
  const ensured = [];
  const original = processes.ensure;
  processes.ensure = async (agent) => {
    ensured.push(agent.alias);
    return original(agent);
  };
  const t0 = Date.now();
  const result = await request(server, {
    path: '/v1/chat/completions',
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: { model: 'tool-router-agent', messages: [{ role: 'user', content: 'write a python function named hello' }] },
  });
  const elapsed = Date.now() - t0;
  assert.equal(result.status, 200);
  assert.equal(result.headers['x-green-roomz-effective-alias'], 'tool-router-agent');
  assert.equal(result.body.choices[0].message.content, 'resident-ok');
  assert.equal(ensured.includes('qwenstral-code-speculator'), false);
  assert.ok(elapsed < 2000, `resident fallback took ${elapsed}ms`);
  assert.equal(urls.every((url) => url.includes('18187')), true);
});

test('generic ChatGPT-compat hello skips nexus and answers on Instruct', async (t) => {
  const urls = [];
  const { server } = await withServer(t, {}, {
    ready: ['tool-router-agent', 'general-text-speculator'],
    stubEnsure: true,
    fetchImpl: async (url) => {
      urls.push(String(url));
      if (String(url).includes(':18187')) throw new Error('generic chat must not consult nexus');
      return jsonFetch({ choices: [{ message: { role: 'assistant', content: 'Hello there!' } }] });
    },
  });
  const result = await request(server, {
    path: '/v1/chat/completions',
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: { model: 'general-text-speculator', messages: [{ role: 'user', content: 'Say hello in one short sentence.' }] },
  });
  assert.equal(result.status, 200);
  assert.equal(result.headers['x-green-roomz-effective-alias'], 'general-text-speculator');
  assert.equal(result.headers['x-green-roomz-route-reason'], 'chat_default');
  assert.equal(result.body.choices[0].message.content, 'Hello there!');
  assert.equal(urls.some((url) => url.includes(':18187')), false);
});

test('nexus-picked cold specialist is not started; chat falls back to resident', async (t) => {
  const urls = [];
  const { server, processes } = await withServer(t, {}, {
    ready: ['tool-router-agent'],
    stubEnsure: true,
    fetchImpl: async (url, init) => {
      urls.push(String(url));
      const body = JSON.parse(Buffer.from(init.body).toString());
      if (String(body.messages?.[0]?.content ?? '').includes('AVAILABLE:')) {
        return jsonFetch({
          choices: [{ message: { role: 'assistant', content: JSON.stringify({ route: 'general-text-speculator', confidence: 0.9, reason: 'chat' }) } }],
        });
      }
      assert.ok(Number(body.max_tokens) <= 96, `resident_fallback max_tokens ${body.max_tokens}`);
      return jsonFetch({ choices: [{ message: { role: 'assistant', content: 'resident-ok' } }] });
    },
  });
  const ensured = [];
  const original = processes.ensure;
  processes.ensure = async (agent) => {
    ensured.push(agent.alias);
    return original(agent);
  };
  const result = await request(server, {
    path: '/v1/chat/completions',
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: { messages: [{ role: 'user', content: 'hello there' }] },
  });
  assert.equal(result.status, 200);
  assert.equal(result.headers['x-green-roomz-effective-alias'], 'tool-router-agent');
  assert.equal(result.headers['x-green-roomz-route-reason'], 'resident_fallback');
  assert.equal(result.body.choices[0].message.content, 'resident-ok');
  assert.equal(ensured.includes('general-text-speculator'), false);
  assert.equal(urls.some((url) => url.includes(':18184')), false);
});

test('nexus-picked embed is not run as chat; falls back to resident', async (t) => {
  const urls = [];
  const { server } = await withServer(t, {}, {
    ready: ['tool-router-agent', 'semantic-embedding-agent'],
    stubEnsure: true,
    fetchImpl: async (url, init) => {
      urls.push(String(url));
      const body = JSON.parse(Buffer.from(init.body).toString());
      if (String(body.messages?.[0]?.content ?? '').includes('AVAILABLE:')) {
        return jsonFetch({
          choices: [{ message: { role: 'assistant', content: JSON.stringify({ route: 'semantic-embedding-agent', confidence: 0.9, reason: 'oops' }) } }],
        });
      }
      return jsonFetch({ choices: [{ message: { role: 'assistant', content: 'resident-ok' } }] });
    },
  });
  const result = await request(server, {
    path: '/v1/chat/completions',
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: { messages: [{ role: 'user', content: 'Reply with exactly: OK' }] },
  });
  assert.equal(result.status, 200);
  assert.equal(result.headers['x-green-roomz-effective-alias'], 'tool-router-agent');
  assert.equal(result.body.choices[0].message.content, 'resident-ok');
  assert.equal(urls.some((url) => url.includes('/v1/embeddings')), false);
});

test('observeHop posts mailbox and ipc; logger emit throw is swallowed', () => {
  const manifest = sampleManifest();
  const registry = new AgentRegistry(manifest);
  const gateway = new Gateway({
    manifest,
    registry,
    processes: new ProcessManager({ manifest, registry }),
    sessions: new SessionLedger(),
    policy: new PolicyGate('maximize'),
    logger: {
      emit() { throw new Error('logger boom'); },
    },
  });
  gateway.observeHop('success', 'general-text-speculator', {
    ticket: 's1',
    payload: { hops: ['general-text-speculator'] },
  });
  assert.equal(gateway.mailbox.stats().pushed, 1);
  assert.equal(gateway.ipc.stats().hot.pushed, 1);
  const [mail] = gateway.mailbox.recent(1);
  assert.equal(typeof mail.seq, 'number');
  assert.equal(mail.ticket, 's1');
  const [ipcEvent] = gateway.ipc.recent(1);
  assert.equal(ipcEvent.kind, 'success');
  assert.equal(ipcEvent.ticket, 's1');
});

test('/code slash pins the code specialist and skips nexus', async (t) => {
  const urls = [];
  const { server } = await withServer(t, {}, {
    ready: ['qwenstral-code-speculator', 'general-text-speculator', 'tool-router-agent'],
    stubEnsure: true,
    fetchImpl: async (url) => {
      urls.push(String(url));
      return jsonFetch({ choices: [{ message: { role: 'assistant', content: 'int main() { return 0; }' } }] });
    },
  });
  const result = await request(server, {
    path: '/v1/chat/completions',
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: {
      model: 'general-text-speculator',
      messages: [{ role: 'user', content: '/code write hello' }],
    },
  });
  assert.equal(result.status, 200);
  assert.equal(result.headers['x-green-roomz-effective-alias'], 'qwenstral-code-speculator');
  assert.equal(result.headers['x-green-roomz-route-reason'], 'slash_code');
  assert.equal(urls.some((url) => url.includes(':18187')), false);
  assert.equal(urls.some((url) => url.includes(':18183')), true);
});

test('/text slash pins general-text even on a python-looking prompt', async (t) => {
  const urls = [];
  const { server } = await withServer(t, {}, {
    ready: ['qwenstral-code-speculator', 'general-text-speculator', 'tool-router-agent'],
    stubEnsure: true,
    fetchImpl: async (url) => {
      urls.push(String(url));
      return jsonFetch({ choices: [{ message: { role: 'assistant', content: 'a short poem' } }] });
    },
  });
  const result = await request(server, {
    path: '/v1/chat/completions',
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: {
      model: 'qwenstral-code-speculator',
      messages: [{ role: 'user', content: '/text write a python function named hello' }],
    },
  });
  assert.equal(result.status, 200);
  assert.equal(result.headers['x-green-roomz-effective-alias'], 'general-text-speculator');
  assert.equal(result.headers['x-green-roomz-route-reason'], 'slash_text');
  assert.equal(urls.some((url) => url.includes(':18187')), false);
  assert.equal(urls.some((url) => url.includes(':18184')), true);
});

test('plain text does not hop to vision even if nexus emits vision-layout-agent', async (t) => {
  const urls = [];
  const { server } = await withServer(t, {}, {
    ready: ['tool-router-agent', 'vision-layout-agent', 'general-text-speculator'],
    stubEnsure: true,
    fetchImpl: async (url) => {
      urls.push(String(url));
      if (String(url).includes(':18187')) {
        return jsonFetch({
          choices: [{ message: { role: 'assistant', content: JSON.stringify({ route: 'vision-layout-agent', confidence: 0.9, reason: 'looks visual' }) } }],
        });
      }
      return jsonFetch({ choices: [{ message: { role: 'assistant', content: 'plain-ok' } }] });
    },
  });
  const result = await request(server, {
    path: '/v1/chat/completions',
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: { messages: [{ role: 'user', content: 'hello there' }] },
  });
  assert.equal(result.status, 200);
  assert.notEqual(result.headers['x-green-roomz-effective-alias'], 'vision-layout-agent');
  assert.equal(result.headers['x-green-roomz-effective-alias'], 'general-text-speculator');
  assert.doesNotMatch(result.headers['x-green-roomz-route-reason'] ?? '', /after:/);
  assert.equal(urls.some((url) => url.includes(':18181')), false);
  assert.notEqual(result.status, 503);
});

test('/code on an impractical specialist falls back to resident 0.5B instead of 503', async (t) => {
  const urls = [];
  const { server, registry, processes } = await withServer(t, {}, {
    ready: ['tool-router-agent'],
    stubEnsure: true,
    fetchImpl: async (url) => {
      urls.push(String(url));
      assert.equal(String(url).includes(':18183'), false, 'must not hop to impractical code specialist');
      return jsonFetch({ choices: [{ message: { role: 'assistant', content: 'resident-ok' } }] });
    },
  });
  registry.setStatus('qwenstral-code-speculator', 'unavailable', { missing: ['impractical:RAM'] });
  const ensured = [];
  const original = processes.ensure;
  processes.ensure = async (agent) => {
    ensured.push(agent.alias);
    return original(agent);
  };
  const result = await request(server, {
    path: '/v1/chat/completions',
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: { messages: [{ role: 'user', content: '/code write hello' }] },
  });
  assert.notEqual(result.status, 503);
  assert.equal(result.status, 200);
  assert.equal(result.headers['x-green-roomz-effective-alias'], 'tool-router-agent');
  assert.equal(result.body.choices[0].message.content, 'resident-ok');
  assert.equal(ensured.includes('qwenstral-code-speculator'), false);
  assert.equal(urls.every((url) => url.includes('18187')), true);
});

test('/embed on chat completions uses /v1/embeddings and wraps as chat', async (t) => {
  const urls = [];
  const { server } = await withServer(t, {}, {
    ready: ['semantic-embedding-agent', 'tool-router-agent'],
    stubEnsure: true,
    fetchImpl: async (url, init) => {
      urls.push(String(url));
      const body = JSON.parse(Buffer.from(init.body).toString());
      assert.equal(body.input, 'hello world');
      return jsonFetch({ object: 'list', data: [{ embedding: [0.1, 0.2], index: 0 }] });
    },
  });
  const result = await request(server, {
    path: '/v1/chat/completions',
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: { messages: [{ role: 'user', content: '/embed hello world' }] },
  });
  assert.equal(result.status, 200);
  assert.equal(result.headers['x-green-roomz-effective-alias'], 'semantic-embedding-agent');
  assert.equal(result.headers['x-green-roomz-route-reason'], 'slash_embed');
  assert.equal(urls.some((url) => url.includes('/v1/embeddings')), true);
  assert.equal(urls.some((url) => url.includes('/v1/chat/completions')), false);
  const wrapped = JSON.parse(result.body.choices[0].message.content);
  assert.equal(wrapped.data[0].index, 0);
});

test('/rerank on chat completions uses /v1/rerank', async (t) => {
  const urls = [];
  const { server } = await withServer(t, {}, {
    ready: ['retrieval-rerank-agent', 'tool-router-agent'],
    stubEnsure: true,
    fetchImpl: async (url, init) => {
      urls.push(String(url));
      const body = JSON.parse(Buffer.from(init.body).toString());
      assert.equal(body.query, 'cats');
      assert.deepEqual(body.documents, ['a cat sat', 'a dog ran']);
      return jsonFetch({ results: [{ index: 0, relevance_score: 0.9 }] });
    },
  });
  const result = await request(server, {
    path: '/v1/chat/completions',
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: { messages: [{ role: 'user', content: '/rerank cats\na cat sat\na dog ran' }] },
  });
  assert.equal(result.status, 200);
  assert.equal(result.headers['x-green-roomz-effective-alias'], 'retrieval-rerank-agent');
  assert.equal(urls.some((url) => url.includes('/v1/rerank')), true);
});

test('/router on chat completions stays on the resident 0.5B', async (t) => {
  const urls = [];
  const { server } = await withServer(t, {}, {
    ready: ['tool-router-agent', 'general-text-speculator'],
    stubEnsure: true,
    fetchImpl: async (url) => {
      urls.push(String(url));
      return jsonFetch({ choices: [{ message: { role: 'assistant', content: 'router-kernel' } }] });
    },
  });
  const result = await request(server, {
    path: '/v1/chat/completions',
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: { model: 'general-text-speculator', messages: [{ role: 'user', content: '/router ping' }] },
  });
  assert.equal(result.status, 200);
  assert.equal(result.headers['x-green-roomz-effective-alias'], 'tool-router-agent');
  assert.equal(result.headers['x-green-roomz-route-reason'], 'slash_router');
  assert.equal(urls.every((url) => url.includes('18187')), true);
});

test('/vision without an image is 400', async (t) => {
  const { server } = await withServer(t, {}, { stubEnsure: true, fetchImpl: async () => jsonFetch({ choices: [{ message: { content: 'no' } }] }) });
  const result = await request(server, {
    path: '/v1/chat/completions',
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: { messages: [{ role: 'user', content: '/vision what is this' }] },
  });
  assert.equal(result.status, 400);
});

test('/tts on chat completions is 503 when piper is missing', async (t) => {
  const { server, registry } = await withServer(t, {}, {
    ready: ['tool-router-agent', 'general-text-speculator'],
    stubEnsure: true,
    fetchImpl: async () => jsonFetch({ choices: [{ message: { role: 'assistant', content: 'resident-ok' } }] }),
  });
  registry.setStatus('speech-synthesis-agent', 'unavailable', { missing: ['model:/tmp/missing-voice.onnx'] });
  const result = await request(server, {
    path: '/v1/chat/completions',
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: { messages: [{ role: 'user', content: '/tts hello' }] },
  });
  assert.equal(result.status, 503);
  assert.equal(result.headers['x-green-roomz-effective-alias'], 'speech-synthesis-agent');
  assert.match(String(result.body?.error?.message ?? ''), /speech-synthesis-agent is unavailable/);
});

test('/draw and /imagine on unavailable image-generation-agent are 503', async (t) => {
  const { server, registry } = await withServer(t, {}, {
    ready: ['tool-router-agent', 'general-text-speculator'],
    stubEnsure: true,
    fetchImpl: async () => jsonFetch({ choices: [{ message: { role: 'assistant', content: 'resident-ok' } }] }),
  });
  registry.setStatus('image-generation-agent', 'unavailable', { missing: ['model:/tmp/missing-sd.gguf'] });
  for (const content of ['/draw a red apple', '/imagine a sunset']) {
    const result = await request(server, {
      path: '/v1/chat/completions',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: { messages: [{ role: 'user', content }] },
    });
    assert.equal(result.status, 503, content);
    assert.equal(result.headers['x-green-roomz-effective-alias'], 'image-generation-agent', content);
    assert.match(String(result.body?.error?.message ?? ''), /image-generation-agent is unavailable/);
  }
});

test('model image-generation-agent unavailable is 503 not resident 200', async (t) => {
  const { server, registry } = await withServer(t, {}, {
    ready: ['tool-router-agent', 'general-text-speculator'],
    stubEnsure: true,
    fetchImpl: async () => jsonFetch({ choices: [{ message: { role: 'assistant', content: 'resident-ok' } }] }),
  });
  registry.setStatus('image-generation-agent', 'unavailable', { missing: ['model:/tmp/missing-sd.gguf'] });
  const result = await request(server, {
    path: '/v1/chat/completions',
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: { model: 'image-generation-agent', messages: [{ role: 'user', content: 'a red apple' }] },
  });
  assert.equal(result.status, 503);
  assert.equal(result.headers['x-green-roomz-effective-alias'], 'image-generation-agent');
  assert.match(String(result.body?.error?.message ?? ''), /image-generation-agent is unavailable/);
});

test('plain follow-up after /code consults nexus instead of staying on code', async (t) => {
  const urls = [];
  const sessions = new SessionLedger();
  const { server } = await withServer(t, {}, {
    ready: ['qwenstral-code-speculator', 'general-text-speculator', 'tool-router-agent'],
    stubEnsure: true,
    sessions,
    fetchImpl: async (url) => {
      urls.push(String(url));
      if (String(url).includes(':18187')) {
        return jsonFetch({
          choices: [{ message: { role: 'assistant', content: JSON.stringify({ route: 'general-text-speculator', confidence: 0.9, reason: 'default_text' }) } }],
        });
      }
      return jsonFetch({ choices: [{ message: { role: 'assistant', content: 'a limerick' } }] });
    },
  });
  const first = await request(server, {
    path: '/v1/chat/completions',
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: { messages: [{ role: 'user', content: '/code int main' }] },
  });
  assert.equal(first.headers['x-green-roomz-effective-alias'], 'qwenstral-code-speculator');
  const sid = first.headers['x-session-id'];
  const second = await request(server, {
    path: '/v1/chat/completions',
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-session-id': sid },
    body: {
      model: 'qwenstral-code-speculator',
      messages: [
        { role: 'user', content: '/code int main' },
        { role: 'assistant', content: 'int main() {}' },
        { role: 'user', content: 'write a short limerick about rain' },
      ],
    },
  });
  assert.equal(second.status, 200);
  assert.equal(second.headers['x-green-roomz-effective-alias'], 'general-text-speculator');
  assert.equal(urls.some((url) => url.includes(':18187')), true);
});

test('mixed image and audio on chat is not 400', async (t) => {
  const { server } = await withServer(t, {}, {
    ready: ['tool-router-agent', 'vision-layout-agent', 'audio-transcription-agent', 'general-text-speculator'],
    stubEnsure: true,
    fetchImpl: async (url) => {
      if (String(url).includes(':18187')) {
        return jsonFetch({
          choices: [{ message: { role: 'assistant', content: JSON.stringify({ route: 'vision-layout-agent', confidence: 0.8, reason: 'image_input' }) } }],
        });
      }
      return jsonFetch({ choices: [{ message: { role: 'assistant', content: 'saw-it' } }] });
    },
  });
  const result = await request(server, {
    path: '/v1/chat/completions',
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: {
      messages: [{ role: 'user', content: [
        { type: 'image_url', image_url: { url: 'data:image/png;base64,x' } },
        { type: 'input_audio', input_audio: { data: 'data:audio/wav;base64,x' } },
      ] }],
    },
  });
  assert.notEqual(result.status, 400);
  assert.notEqual(result.status, 500);
  assert.equal(result.status, 200);
});

test('H3 council parallel:true serializes when specialists exceed maxWarmSpecialists', async (t) => {
  let inflight = 0;
  let maxInflight = 0;
  const { server, processes } = await withServer(t, {}, {
    ready: ['qwenstral-code-speculator', 'general-text-speculator', 'tool-router-agent'],
    stubEnsure: true,
    fetchImpl: async () => jsonFetch({ choices: [{ message: { content: 'hello from variant' } }] }),
  });
  processes.maxWarmSpecialists = 1;
  const inner = processes.ensure;
  processes.ensure = async (agent) => {
    inflight += 1;
    maxInflight = Math.max(maxInflight, inflight);
    await new Promise((resolve) => setTimeout(resolve, 40));
    try {
      return await inner(agent);
    } finally {
      inflight -= 1;
    }
  };
  const result = await request(server, {
    path: '/v1/chat/completions',
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: {
      messages: [{ role: 'user', content: 'hi' }],
      council: {
        variants: ['qwenstral-code-speculator', 'general-text-speculator'],
        parallel: true,
        judge: 'field-vote',
      },
    },
  });
  assert.equal(result.status, 200);
  assert.equal(maxInflight, 1);
});

test('/props distinguishes declared, callable, and loaded capabilities', async (t) => {
  const { server } = await withServer(t);
  const result = await request(server, { path: '/props' });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.capability_reporting, {
    native_capabilities: 'declared',
    callable_capabilities: 'runtime_checked',
    ready_capabilities: 'loaded_now',
  });
  assert.equal('native_capabilities_are_truthful' in result.body, false);
  const vision = result.body.models.find((model) => model.id === 'vision-layout-agent');
  assert.ok(vision.native_capabilities.includes('image'));
  assert.deepEqual(vision.callable_capabilities, []);
});

test('a request from a disallowed peer is 403', async (t) => {
  const { server, gateway } = await withServer(t);
  gateway.manifest.gateway.allow_peers = ['203.0.113.7'];
  const orig = gateway.handle.bind(gateway);
  gateway.handle = (req, res) => { Object.defineProperty(req.socket, 'remoteAddress', { value: '198.51.100.9', configurable: true }); return orig(req, res); };
  const res = await request(server, { path: '/v1/health' });
  assert.equal(res.status, 403);
});

test('bind-all needs the override; a specific LAN host needs allow_peers or a key', async () => {
  const mk = (gw = {}) => {
    const manifest = sampleManifest({ gateway: gw });
    const registry = new AgentRegistry(manifest);
    return new Gateway({ manifest, registry, processes: new ProcessManager({ manifest, registry }), sessions: new SessionLedger(), policy: new PolicyGate('maximize') });
  };
  delete process.env.GREEN_ROOMZ_API_KEY;
  delete process.env.GREEN_ROOMZ_ALLOW_PUBLIC;

  assert.throws(() => mk().bindAddress('0.0.0.0'), /all interfaces/);
  assert.throws(() => mk().bindAddress('192.168.1.5'), /allow_peers/);
  assert.equal(mk({ allow_peers: ['192.168.1.42'] }).bindAddress('192.168.1.5'), '192.168.1.5');
  assert.equal(mk().bindAddress('127.0.0.1'), '127.0.0.1');
});

test('peerAllowed gates non-loopback clients against the allowlist', async () => {
  const { peerAllowed, normalizeAddr } = await import('../src/gateway.mjs');
  assert.equal(peerAllowed('127.0.0.1', []), true);
  assert.equal(peerAllowed('::1', []), true);
  assert.equal(peerAllowed('::ffff:127.0.0.1', []), true);
  assert.equal(normalizeAddr('::ffff:192.168.1.42'), '192.168.1.42');
  assert.equal(peerAllowed('192.168.1.42', ['192.168.1.42']), true);
  assert.equal(peerAllowed('::ffff:192.168.1.42', ['192.168.1.42']), true);
  assert.equal(peerAllowed('192.168.1.43', ['192.168.1.42']), false);
  assert.equal(peerAllowed('192.168.1.99', ['192.168.1.0/24']), true);
  assert.equal(peerAllowed('10.0.0.1', ['192.168.1.0/24']), false);
});

test('council: /council on sets a session default that fans out later turns', async (t) => {
  const manifest = sampleManifest();
  const vl = manifest.agents.find((a) => a.alias === 'vision-layout-agent');
  manifest.agents.push({ ...vl, alias: 'vision-layout-agent@b', variant_of: 'vision-layout-agent', port: 18281, model: '/tmp/b.gguf' });
  const registry = await new AgentRegistry(manifest).inspect();
  for (const a of ['vision-layout-agent', 'vision-layout-agent@b', 'tool-router-agent']) registry.setStatus(a, 'ready');
  const processes = new ProcessManager({ manifest, registry, spawnImpl() { throw new Error('no'); } });
  processes.ensure = async (agent) => ({ alias: agent.alias, state: 'ready' });
  const gateway = new Gateway({
    manifest, registry, processes, sessions: new SessionLedger(), policy: new PolicyGate('maximize'),
    fetchImpl: async () => jsonFetch({ choices: [{ message: { role: 'assistant', content: '{"brand":"Acme"}' } }] }),
  });
  const server = await gateway.listen('127.0.0.1', 0);
  t.after(() => server.close());

  const on = await request(server, {
    path: '/v1/chat/completions', method: 'POST', headers: { 'content-type': 'application/json' },
    body: { messages: [{ role: 'user', content: '/council on vision-layout-agent field-vote' }] },
  });
  const sid = on.headers['x-session-id'];
  assert.ok(sid);

  const later = await request(server, {
    path: '/v1/chat/completions', method: 'POST',
    headers: { 'content-type': 'application/json', 'x-session-id': sid },
    body: { messages: [{ role: 'user', content: 'extract the brand' }] },
  });
  assert.equal(later.status, 200);
  assert.equal(later.body.council.variants.length, 2);

  const off = await request(server, {
    path: '/v1/chat/completions', method: 'POST',
    headers: { 'content-type': 'application/json', 'x-session-id': sid },
    body: { messages: [{ role: 'user', content: '/council off' }] },
  });
  assert.equal(off.status, 200);
  const afterOff = await request(server, {
    path: '/v1/chat/completions', method: 'POST',
    headers: { 'content-type': 'application/json', 'x-session-id': sid },
    body: { messages: [{ role: 'user', content: 'hello again' }] },
  });
  assert.equal(afterOff.body.council, undefined, 'council default cleared');
});

test('council: a /council slash message triggers the fan-out (same as the JSON form)', async (t) => {
  const manifest = sampleManifest();
  const vl = manifest.agents.find((a) => a.alias === 'vision-layout-agent');
  manifest.agents.push({ ...vl, alias: 'vision-layout-agent@b', variant_of: 'vision-layout-agent', port: 18281, model: '/tmp/b.gguf' });

  const registry = await new AgentRegistry(manifest).inspect();
  for (const a of ['vision-layout-agent', 'vision-layout-agent@b', 'tool-router-agent']) registry.setStatus(a, 'ready');
  const processes = new ProcessManager({ manifest, registry, spawnImpl() { throw new Error('no'); } });
  processes.ensure = async (agent) => ({ alias: agent.alias, state: 'ready' });

  const seen = [];
  const gateway = new Gateway({
    manifest, registry, processes, sessions: new SessionLedger(), policy: new PolicyGate('maximize'),
    fetchImpl: async (url, init) => {
      seen.push(JSON.parse(init.body).messages.at(-1).content);
      return jsonFetch({ choices: [{ message: { role: 'assistant', content: '{"brand":"Acme"}' } }] });
    },
  });
  const server = await gateway.listen('127.0.0.1', 0);
  t.after(() => server.close());

  const res = await request(server, {
    path: '/v1/chat/completions', method: 'POST', headers: { 'content-type': 'application/json' },
    body: { messages: [{ role: 'user', content: '/council vision-layout-agent field-vote extract the brand' }] },
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.council.variants.length, 2);
  assert.match(res.headers['x-green-roomz-council'], /"judge":"field-vote"/);
  assert.ok(seen.every((c) => c === 'extract the brand'), JSON.stringify(seen));
});

test('council: a split turn (agreement < 0.6) is logged to disagreements.jsonl', async (t) => {
  const { mkdtempSync, readFileSync, existsSync } = await import('node:fs');
  const os = await import('node:os');
  const nodePath = await import('node:path');
  const dir = mkdtempSync(nodePath.join(os.tmpdir(), 'grz-disagree-'));

  const manifest = sampleManifest();
  manifest.gateway.council_dir = dir;
  const vl = manifest.agents.find((a) => a.alias === 'vision-layout-agent');
  manifest.agents.push({ ...vl, alias: 'vision-layout-agent@b', variant_of: 'vision-layout-agent', port: 18281, model: '/tmp/b.gguf' });
  manifest.agents.push({ ...vl, alias: 'vision-layout-agent@c', variant_of: 'vision-layout-agent', port: 18282, model: '/tmp/c.gguf' });
  const registry = await new AgentRegistry(manifest).inspect();
  for (const a of ['vision-layout-agent', 'vision-layout-agent@b', 'vision-layout-agent@c', 'tool-router-agent']) registry.setStatus(a, 'ready');
  const processes = new ProcessManager({ manifest, registry, spawnImpl() { throw new Error('no'); } });
  processes.ensure = async (agent) => ({ alias: agent.alias, state: 'ready' });

  const answers = { 18181: '{"brand":"Acme"}', 18281: '{"brand":"Beta"}', 18282: '{"brand":"Gamma"}' };
  const gateway = new Gateway({
    manifest, registry, processes, sessions: new SessionLedger(), policy: new PolicyGate('maximize'),
    fetchImpl: async (url) => jsonFetch({ choices: [{ message: { role: 'assistant', content: answers[Number(String(url).match(/:(\d+)\//)[1])] } }] }),
  });
  const server = await gateway.listen('127.0.0.1', 0);
  t.after(() => server.close());

  await request(server, {
    path: '/v1/chat/completions', method: 'POST', headers: { 'content-type': 'application/json' },
    body: { council: { of: 'vision-layout-agent' }, messages: [{ role: 'user', content: 'what brand is on the label' }] },
  });

  const file = nodePath.join(dir, 'disagreements.jsonl');
  assert.ok(existsSync(file), 'disagreements.jsonl written');
  const entry = JSON.parse(readFileSync(file, 'utf8').trim());
  assert.ok(entry.agreement < 0.6);
  assert.equal(entry.prompt, 'what brand is on the label');
  assert.equal(entry.answers.length, 3);
});

test('council: councilWeights derives 0.5 + agree_rate from the scorecard (>= 5 runs)', async (t) => {
  const { mkdtempSync, writeFileSync } = await import('node:fs');
  const os = await import('node:os');
  const nodePath = await import('node:path');
  const dir = mkdtempSync(nodePath.join(os.tmpdir(), 'grz-weights-'));
  const row = (results) => JSON.stringify({ task: 'vision', results });
  const lines = [];
  for (let i = 0; i < 6; i += 1) {
    lines.push(row([
      { alias: 'v', verdict: i < 5 ? 'winner' : 'outlier' },
      { alias: 'w', verdict: 'outlier' },
      { alias: 'rare', verdict: 'winner' },
    ].slice(0, i === 0 ? 3 : 2)));
  }
  writeFileSync(nodePath.join(dir, 'scores.jsonl'), lines.join('\n'));

  const manifest = sampleManifest();
  manifest.gateway.council_dir = dir;
  const gateway = new Gateway({
    manifest, registry: await new AgentRegistry(manifest).inspect(),
    processes: new ProcessManager({ manifest, registry: new AgentRegistry(manifest), spawnImpl() { throw new Error('no'); } }),
    sessions: new SessionLedger(), policy: new PolicyGate('maximize'),
  });
  const wts = gateway.councilWeights();
  assert.ok(Math.abs(wts.v - (0.5 + 5 / 6)) < 1e-9);
  assert.ok(Math.abs(wts.w - 0.5) < 1e-9);
  assert.equal('rare' in wts, false);
});

test('council: fan out to variants, field-vote the JSON, flag the outlier, write a scorecard', async (t) => {
  const { mkdtempSync, readFileSync } = await import('node:fs');
  const os = await import('node:os');
  const nodePath = await import('node:path');
  const dir = mkdtempSync(nodePath.join(os.tmpdir(), 'grz-council-'));

  const manifest = sampleManifest();
  manifest.gateway.council_dir = dir;
  const vl = manifest.agents.find((a) => a.alias === 'vision-layout-agent');
  manifest.agents.push({ ...vl, alias: 'vision-layout-agent@b', variant_of: 'vision-layout-agent', port: 18281, model: '/tmp/b.gguf' });
  manifest.agents.push({ ...vl, alias: 'vision-layout-agent@c', variant_of: 'vision-layout-agent', port: 18282, model: '/tmp/c.gguf' });

  const registry = await new AgentRegistry(manifest).inspect();
  for (const a of ['vision-layout-agent', 'vision-layout-agent@b', 'vision-layout-agent@c', 'tool-router-agent']) registry.setStatus(a, 'ready');
  const processes = new ProcessManager({ manifest, registry, spawnImpl() { throw new Error('no'); } });
  processes.ensure = async (agent) => ({ alias: agent.alias, state: 'ready' });

  const answers = {
    18181: '{"brand":"Acme","abv":"13.5%"}',
    18281: '{"brand":"Acme","abv":"13.5%"}',
    18282: '{"brand":"Acme","abv":"12%"}',
  };
  const gateway = new Gateway({
    manifest, registry, processes, sessions: new SessionLedger(), policy: new PolicyGate('maximize'),
    fetchImpl: async (url) => {
      const port = Number(String(url).match(/:(\d+)\//)[1]);
      return jsonFetch({ choices: [{ message: { role: 'assistant', content: answers[port] } }] });
    },
  });
  const server = await gateway.listen('127.0.0.1', 0);
  t.after(() => server.close());

  const res = await request(server, {
    path: '/v1/chat/completions', method: 'POST', headers: { 'content-type': 'application/json' },
    body: { council: { of: 'vision-layout-agent', judge: 'field-vote' }, messages: [{ role: 'user', content: 'extract fields' }] },
  });
  assert.equal(res.status, 200);
  assert.equal(JSON.parse(res.body.choices[0].message.content).abv, '13.5%');
  assert.equal(res.body.council.outlier, 'vision-layout-agent@c');
  assert.equal(res.body.council.votes.abv.count, 2);
  assert.equal(res.body.council.variants.length, 3);
  assert.match(res.headers['x-green-roomz-council'], /"winner"/);

  const scores = readFileSync(nodePath.join(dir, 'scores.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(scores.length, 1);
  assert.equal(scores[0].outlier, 'vision-layout-agent@c');
  assert.ok(scores[0].results.some((r) => r.verdict === 'outlier'));
});

test('an image request whose vision backend will not start is a 503, never a text-model 500', async (t) => {
  const { server } = await withServer(t, {}, {
    ready: ['tool-router-agent', 'general-text-speculator'],
    stubEnsure: false,
    fetchImpl: async () => jsonFetch({ choices: [{ message: { content: 'x' } }] }),
  });
  const res = await request(server, {
    path: '/v1/chat/completions', method: 'POST', headers: { 'content-type': 'application/json' },
    body: { model: 'vision-layout-agent', messages: [{ role: 'user', content: [
      { type: 'text', text: 'what is this' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,iVBORw0KGgo=' } },
    ] }] },
  });
  assert.equal(res.status, 503);
  assert.notEqual(res.headers['x-green-roomz-effective-alias'], 'general-text-speculator');
});
