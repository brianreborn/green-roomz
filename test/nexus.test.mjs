import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Readable } from 'node:stream';
import { AgentRegistry } from '../src/registry.mjs';
import { ProcessManager } from '../src/process-manager.mjs';
import { PolicyGate } from '../src/scheduler.mjs';
import { SessionLedger } from '../src/sessions.mjs';
import { Gateway } from '../src/gateway.mjs';
import { isHandoffContent, parseHandoffContent } from '../src/handoff.mjs';
import { sampleManifest } from './helpers.mjs';

async function withServer(t, extras = {}) {
  const manifest = sampleManifest();
  const registry = await new AgentRegistry(manifest).inspect();
  for (const alias of extras.ready ?? []) registry.setStatus(alias, 'ready');
  const hostAdapter = extras.hostAdapter ?? { sampleResources() { return { freeMemoryBytes: 1 }; } };
  const processes = new ProcessManager({ manifest, registry, hostAdapter, spawnImpl() { throw new Error('should not spawn in this test'); } });
  processes.ensure = async (agent) => {
    if (extras.visitedBlock?.has(agent.alias)) throw new Error(`refused ensure of visited ${agent.alias}`);
    return { alias: agent.alias, state: 'ready', resident: agent.alias === 'tool-router-agent' };
  };
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
  t.after(() => server.close());
  return { server, gateway, registry, processes };
}

function request(server, { path, method = 'GET', headers = {}, body } = {}) {
  const { port } = server.address();
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path, method, headers, family: 4, timeout: 5000 }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString() || 'null';
        let parsed;
        try { parsed = JSON.parse(raw); } catch { parsed = raw; }
        resolve({ status: res.statusCode, headers: res.headers, body: parsed, raw });
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(new Error('request timeout')); });
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

function sseFetch(content, status = 200) {
  const stream = [
    `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`,
    `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] })}\n\n`,
    'data: [DONE]\n\n',
  ].join('');
  return {
    status,
    headers: new Headers({ 'content-type': 'text/event-stream' }),
    body: Readable.toWeb(Readable.from([Buffer.from(stream)])),
  };
}

function nexusThenSpecialists(nexusReplies, specialistFn) {
  let nexusIndex = 0;
  return async (url, init) => {
    const href = String(url);
    const body = JSON.parse(Buffer.from(init.body).toString());
    if (href.includes(':18187')) {
      const reply = nexusReplies[Math.min(nexusIndex, nexusReplies.length - 1)];
      nexusIndex += 1;
      return jsonFetch({ choices: [{ message: { role: 'assistant', content: JSON.stringify(reply) } }] });
    }
    return specialistFn(href, body, { nexusIndex });
  };
}

const imageAskAfterCpp = {
  messages: [
    { role: 'user', content: 'write a C++ program about a hero who saves a village' },
    { role: 'assistant', content: '#include <iostream>\nint main() { std::cout << "hero"; }\n' },
    { role: 'user', content: 'Can you show me an image of how that hero might look?' },
  ],
};

test('HANDOFF parser matches first-line HANDOFF and handoff:true JSON', () => {
  assert.equal(isHandoffContent('HANDOFF {"reason":"not code","suggest":"general-text-speculator"}'), true);
  assert.equal(parseHandoffContent('HANDOFF {"reason":"not code","suggest":null}').reason, 'not code');
  assert.equal(isHandoffContent('{"handoff":true,"reason":"wrong specialist"}'), true);
  assert.equal(isHandoffContent('#include <iostream>'), false);
});

test('image ask after a C++ story hits nexus, skips missing image-gen, does not start code', async (t) => {
  const ensured = [];
  const nexusReplies = [
    { route: 'image-generation-agent', confidence: 0.9, reason: 'image ask' },
    { route: 'general-text-speculator', confidence: 0.7, reason: 'image-gen unavailable' },
  ];
  const { server, processes } = await withServer(t, {
    ready: ['tool-router-agent', 'qwenstral-code-speculator', 'general-text-speculator'],
    fetchImpl: nexusThenSpecialists(nexusReplies, (href) => {
      assert.equal(href.includes(':18183'), false, 'must not start the code specialist');
      assert.match(href, /18184/);
      return jsonFetch({ choices: [{ message: { role: 'assistant', content: 'I cannot draw, but imagine a cloaked hero.' } }] });
    }),
  });
  const original = processes.ensure;
  processes.ensure = async (agent) => {
    ensured.push(agent.alias);
    return original(agent);
  };
  const result = await request(server, {
    path: '/v1/chat/completions',
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: imageAskAfterCpp,
  });
  assert.equal(result.status, 200);
  assert.equal(result.headers['x-green-roomz-effective-alias'], 'general-text-speculator');
  assert.equal(result.headers['x-green-roomz-nexus'], 'tool-router-agent');
  assert.doesNotMatch(result.headers['x-green-roomz-hops'] ?? '', /qwenstral-code-speculator/);
  assert.match(result.body.choices[0].message.content, /hero|cannot draw/i);
  assert.equal(ensured.includes('qwenstral-code-speculator'), false);
  assert.equal(ensured.includes('image-generation-agent'), false);
});

test('HANDOFF in first specialist tokens routes to a second specialist', async (t) => {
  let specialistCalls = 0;
  const { server } = await withServer(t, {
    ready: ['tool-router-agent', 'qwenstral-code-speculator', 'general-text-speculator'],
    fetchImpl: nexusThenSpecialists(
      [
        { route: 'qwenstral-code-speculator', confidence: 0.8, reason: 'looks like code' },
        { route: 'general-text-speculator', confidence: 0.8, reason: 'code handed off' },
      ],
      (href) => {
        specialistCalls += 1;
        if (href.includes(':18183')) {
          return sseFetch('HANDOFF {"reason":"this is a story request","suggest":"general-text-speculator"}');
        }
        return jsonFetch({ choices: [{ message: { role: 'assistant', content: 'Once upon a time a hero walked into the village.' } }] });
      },
    ),
  });
  const result = await request(server, {
    path: '/v1/chat/completions',
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: { model: 'qwenstral-code-speculator', messages: [{ role: 'user', content: 'tell me a short hero story' }] },
  });
  assert.equal(result.status, 200);
  assert.equal(result.headers['x-green-roomz-effective-alias'], 'general-text-speculator');
  assert.match(result.headers['x-green-roomz-hops'], /qwenstral-code-speculator/);
  assert.match(result.headers['x-green-roomz-hops'], /general-text-speculator/);
  assert.match(result.body.choices[0].message.content, /Once upon a time/);
  assert.equal(specialistCalls, 2);
});

test('visited blocks looping the same specialist', async (t) => {
  const ensured = [];
  const { server, processes } = await withServer(t, {
    ready: ['tool-router-agent', 'qwenstral-code-speculator', 'general-text-speculator'],
    fetchImpl: nexusThenSpecialists(
      [{ route: 'qwenstral-code-speculator', confidence: 1, reason: 'always code' }],
      (url) => (String(url).includes(':18184')
        ? sseFetch('sure, hi')                                                   // general-text answers
        : sseFetch('HANDOFF {"reason":"not my job","suggest":"qwenstral-code-speculator"}')), // code hands off
    ),
  });
  const original = processes.ensure;
  processes.ensure = async (agent) => {
    ensured.push(agent.alias);
    if (ensured.filter((alias) => alias === agent.alias && alias !== 'tool-router-agent').length > 1) {
      throw new Error(`loop ensure ${agent.alias}`);
    }
    if (['tool-router-agent', 'general-text-speculator'].includes(agent.alias)) return { alias: agent.alias, state: 'ready' };
    return original(agent);
  };
  const result = await request(server, {
    path: '/v1/chat/completions',
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: { messages: [{ role: 'user', content: 'hello' }] },
  });
  // The same specialist is never tried twice, and instead of failing closed the
  // turn lands on the general-text fallback.
  assert.equal(result.status, 200);
  assert.equal(result.headers['x-green-roomz-effective-alias'], 'general-text-speculator');
  assert.equal(ensured.filter((alias) => alias === 'qwenstral-code-speculator').length, 1);
});

test('actual image part still routes to vision without asking the nexus', async (t) => {
  let nexusHits = 0;
  const { server } = await withServer(t, {
    ready: ['vision-layout-agent', 'tool-router-agent', 'qwenstral-code-speculator'],
    fetchImpl: async (url) => {
      const href = String(url);
      if (href.includes(':18187')) {
        nexusHits += 1;
        throw new Error('nexus should not be consulted for an image part');
      }
      assert.match(href, /18181/);
      return jsonFetch({ choices: [{ message: { role: 'assistant', content: '| col |\n| --- |\n| val |' } }] });
    },
  });
  const result = await request(server, {
    path: '/v1/chat/completions',
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: {
      model: 'qwenstral-code-speculator',
      messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,xxxx' } }] }],
    },
  });
  assert.equal(result.status, 200);
  assert.equal(result.headers['x-green-roomz-effective-alias'], 'vision-layout-agent');
  assert.equal(result.headers['x-green-roomz-route-reason'], 'image_input');
  assert.equal(nexusHits, 0);
});

test('consultNexus omits impractical aliases from AVAILABLE the way unused vision/audio are omitted', async (t) => {
  const enums = [];
  const { server, registry } = await withServer(t, {
    ready: ['tool-router-agent', 'qwenstral-code-speculator', 'general-text-speculator'],
    fetchImpl: async (url, init) => {
      const href = String(url);
      const body = JSON.parse(Buffer.from(init.body).toString());
      if (href.includes(':18187')) {
        enums.push(body.json_schema?.properties?.route?.enum ?? []);
        assert.equal(enums.at(-1).includes('qwenstral-code-speculator'), false);
        assert.equal(enums.at(-1).includes('vision-layout-agent'), false);
        return jsonFetch({ choices: [{ message: { role: 'assistant', content: JSON.stringify({ route: 'general-text-speculator', confidence: 0.7, reason: 'text' }) } }] });
      }
      return jsonFetch({ choices: [{ message: { role: 'assistant', content: 'hello from text' } }] });
    },
  });
  registry.setStatus('qwenstral-code-speculator', 'unavailable', { missing: ['impractical:estimate 9800000000 + headroom 2147483648 > free 11000000000'] });
  const result = await request(server, {
    path: '/v1/chat/completions',
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: { messages: [{ role: 'user', content: 'write a python function named hello' }] },
  });
  assert.equal(result.status, 200);
  assert.equal(result.headers['x-green-roomz-effective-alias'], 'general-text-speculator');
  assert.ok(enums.length >= 1);
});
