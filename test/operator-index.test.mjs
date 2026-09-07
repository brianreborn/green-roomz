import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { AgentRegistry } from '../src/registry.mjs';
import { ProcessManager } from '../src/process-manager.mjs';
import { PolicyGate } from '../src/scheduler.mjs';
import { SessionLedger } from '../src/sessions.mjs';
import { Gateway } from '../src/gateway.mjs';
import { sampleManifest } from './helpers.mjs';

async function withServer(t) {
  const manifest = sampleManifest();
  const registry = await new AgentRegistry(manifest).inspect();
  const hostAdapter = { sampleResources() { return { freeMemoryBytes: 1 }; } };
  const processes = new ProcessManager({
    manifest,
    registry,
    hostAdapter,
    spawnImpl() { throw new Error('should not spawn in this test'); },
  });
  const gateway = new Gateway({
    manifest,
    registry,
    processes,
    sessions: new SessionLedger(),
    policy: new PolicyGate('maximize'),
    hostAdapter,
  });
  const server = await gateway.listen('127.0.0.1', 0);
  t.after(() => server.close());
  return server;
}

function rawGet(server, path) {
  const { port } = server.address();
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path, method: 'GET', family: 4, timeout: 5000 }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({
        status: res.statusCode,
        type: res.headers['content-type'],
        body: Buffer.concat(chunks).toString('utf8'),
      }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('GET / is an HTML operator page, not a JSON 404', async (t) => {
  const server = await withServer(t);
  const page = await rawGet(server, '/');
  assert.equal(page.status, 200);
  assert.match(page.type, /text\/html/);
  assert.match(page.body, /OpenAI-compatible HTTP API/);
  assert.match(page.body, /chat-mvp/);
  assert.match(page.body, /not https/);
  assert.match(page.body, /\/health/);
});
