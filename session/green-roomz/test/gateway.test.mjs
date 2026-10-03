import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AgentRegistry } from '../src/registry.mjs';
import { ProcessManager } from '../src/process-manager.mjs';
import { PolicyGate } from '../src/scheduler.mjs';
import { SessionLedger } from '../src/sessions.mjs';
import { Gateway, prepareInferenceBody } from '../src/gateway.mjs';
import { sampleManifest } from './helpers.mjs';

async function withServer(t, env = {}, extras = {}) {
  const previous = { ...process.env };
  Object.assign(process.env, env);
  const manifest = sampleManifest();
  const registry = await new AgentRegistry(manifest).inspect();
  for (const alias of extras.ready ?? []) registry.setStatus(alias, 'ready');
  const processes = new ProcessManager({ manifest, registry, spawnImpl() { throw new Error('should not spawn in this test'); } });
  if (extras.stubEnsure) {
    processes.ensure = async (agent) => ({ alias: agent.alias, state: 'ready' });
  }
  const gateway = new Gateway({
    manifest,
    registry,
    processes,
    sessions: extras.sessions ?? new SessionLedger(),
    policy: new PolicyGate('maximize'),
    hostAdapter: { sampleResources() { return { freeMemoryBytes: 1 }; } },
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

test('health is degraded when artifacts are missing and models stay truthful', async (t) => {
  const { server } = await withServer(t);
  const health = await request(server, { path: '/v1/health' });
  assert.equal(health.status, 200);
  assert.equal(health.body.status, 'degraded');
  const vision = health.body.agents.find((agent) => agent.id === 'vision-layout-agent');
  assert.deepEqual(vision.native_capabilities, ['text', 'image']);
  const models = await request(server, { path: '/v1/models' });
  assert.equal(models.body.data.length, 10);
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
  assert.throws(() => gateway.bindAddress('0.0.0.0'), /Public\/non-loopback/);
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
  assert.equal(code.chat_template_kwargs, undefined);
});

test('nexus thinking is always off even if the client asked', () => {
  const forced = prepareInferenceBody({ max_tokens: 64, enable_thinking: true, messages: [] }, { alias: 'tool-router-agent' });
  assert.equal(forced.enable_thinking, false);
  assert.equal(forced.chat_template_kwargs.enable_thinking, false);
});

test('system policy is prepended even when the client already sent a system message', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'grz-policy-'));
  const policyPath = path.join(dir, 'general-text.md');
  writeFileSync(policyPath, 'Be concise.\n');
  const agent = { alias: 'general-text-speculator', system_policy: policyPath };
  const added = prepareInferenceBody({ messages: [{ role: 'user', content: 'hi' }] }, agent);
  assert.equal(added.messages[0].role, 'system');
  assert.equal(added.messages[0].content, 'Be concise.\n');
  assert.equal(added.messages[1].content, 'hi');
  const kept = prepareInferenceBody({
    messages: [{ role: 'system', content: 'already' }, { role: 'user', content: 'hi' }],
  }, agent);
  assert.equal(kept.messages[0].content, 'Be concise.\n');
  assert.equal(kept.messages[1].content, 'already');
  assert.equal(kept.messages.length, 3);
});
