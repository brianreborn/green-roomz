import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { loadOptionalBrainz } from '../src/brainz.mjs';
import { sampleManifest } from './helpers.mjs';
import { AgentRegistry } from '../src/registry.mjs';
import { ProcessManager } from '../src/process-manager.mjs';
import { PolicyGate } from '../src/scheduler.mjs';
import { SessionLedger } from '../src/sessions.mjs';
import { Gateway } from '../src/gateway.mjs';

function postJson(server, body) {
  const { port } = server.address();
  return new Promise((res, rej) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path: '/v1/chat/completions',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      family: 4,
    }, (response) => {
      const chunks = [];
      response.on('data', (c) => chunks.push(c));
      response.on('end', () => res({
        status: response.statusCode,
        headers: response.headers,
        body: JSON.parse(Buffer.concat(chunks).toString() || 'null'),
      }));
    });
    req.on('error', rej);
    req.write(JSON.stringify(body));
    req.end();
  });
}

test('Brainz import skips when GREEN_BRAINZ_ROOT is unset', async () => {
  const loaded = await loadOptionalBrainz({ env: { ...process.env, GREEN_BRAINZ_ROOT: '' } });
  assert.equal(loaded.enabled, false);
  assert.match(loaded.reason, /unset/);
});

test('Goal 4: one chat turn impresses through Brainz and next turn recalls from store without pasted transcript', async (t) => {
  const candidate = process.env.GREEN_BRAINZ_ROOT
    || resolve(process.cwd(), '../green-agentz/systems/green-brainz')
    || resolve(import.meta.dirname, '../../green-agentz/systems/green-brainz');
  if (!existsSync(join(candidate, 'host', 'cognitive-host.mjs'))) {
    t.skip(`green-brainz cognitive-host not found at ${candidate}`);
    return;
  }

  const tempStore = mkdtempSync(join(tmpdir(), 'grz-brainz-e2e-'));
  t.after(() => rmSync(tempStore, { recursive: true, force: true }));

  const brainz = await loadOptionalBrainz({
    env: { ...process.env, GREEN_BRAINZ_ROOT: candidate },
    directory: tempStore,
  });
  assert.equal(brainz.enabled, true);
  assert.equal(typeof brainz.host.observeTurn, 'function');
  assert.equal(typeof brainz.host.injectBoundedRecall, 'function');

  const manifest = sampleManifest();
  const registry = await new AgentRegistry(manifest).inspect();
  registry.setStatus('general-text-speculator', 'ready');
  const upstreamPayloads = [];
  const hostAdapter = { sampleResources() { return { freeMemoryBytes: 1_000_000_000 }; } };
  const processes = new ProcessManager({
    manifest,
    registry,
    hostAdapter,
    spawnImpl() { throw new Error('stub'); },
  });
  processes.ensure = async (agent) => ({ alias: agent.alias, state: 'ready' });

  const gateway = new Gateway({
    manifest,
    registry,
    processes,
    sessions: new SessionLedger(),
    policy: new PolicyGate('maximize'),
    hostAdapter,
    brainz: brainz.host,
    interrupts: brainz.interrupts,
    fetchImpl: async (url, init) => {
      const parsed = JSON.parse(init.body);
      upstreamPayloads.push(parsed);
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: async () => JSON.stringify({
          choices: [{ message: { role: 'assistant', content: 'acknowledged' } }],
        }),
      };
    },
  });

  const server = await gateway.listen('127.0.0.1', 0);
  t.after(() => server.close());

  // Turn 1: user teaches fact through Brainz
  const r1 = await postJson(server, {
    model: 'general-text-speculator',
    lock_alias: true,
    messages: [{ role: 'user', content: 'Remember this fact: the project codename is Project-Starlight' }],
  });
  assert.equal(r1.status, 200);
  assert.equal(upstreamPayloads.length, 1);
  assert.equal(upstreamPayloads[0].messages.some((m) => String(m.content).includes('Green integrated recall')), false);

  // Turn 2: fresh query with ONLY the new question, NO prior turns in messages
  const r2 = await postJson(server, {
    model: 'general-text-speculator',
    lock_alias: true,
    messages: [{ role: 'user', content: 'What is the project codename?' }],
  });
  assert.equal(r2.status, 200);
  assert.equal(upstreamPayloads.length, 2);

  // Verify that turn 2's upstream payload received the recalled fact from Dreamcatcher
  const recallMessage = upstreamPayloads[1].messages.find((m) =>
    m.role === 'system' && String(m.content).includes('Green integrated recall'),
  );
  assert.ok(recallMessage, 'Second turn must have Green integrated recall system message');
  assert.match(
    recallMessage.content,
    /Project-Starlight/,
    'Recalled message must contain the fact impressed during turn 1',
  );
});
