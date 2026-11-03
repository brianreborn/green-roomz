import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withUpstreamKey, keyEligible, redactKey, backendPorts, UPSTREAM_KEY_PATHS } from '../src/upstream-auth.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rec = () => { const calls = []; const f = async (url, init) => { calls.push({ url: String(url), auth: new Headers(init?.headers ?? {}).get('authorization') }); return new Response('{}'); }; return { calls, f }; };

test('SD-32: client Authorization is stripped and replaced by the host key on backend calls', async () => {
  const { calls, f } = rec(); const up = withUpstreamKey(f, 'HOSTKEY', new Set([8081]));
  await up('http://127.0.0.1:8081/v1/chat/completions', { headers: { authorization: 'Bearer client-token', 'content-type': 'application/json' } });
  await up('http://127.0.0.1:8081/health');
  assert.deepEqual(calls.map((c) => c.auth), ['Bearer HOSTKEY', 'Bearer HOSTKEY']);
});
test('SD-32 (b): key only to the fixed host + manifest ports + allowlisted paths', async () => {
  const { calls, f } = rec(); const up = withUpstreamKey(f, 'HOSTKEY', new Set([8081]));
  for (const u of ['http://127.0.0.1:9999/v1/chat/completions', 'http://localhost:8081/v1/chat/completions', 'http://127.0.0.1:8081/evil', 'http://127.0.0.1:8081/', 'http://u:p@127.0.0.1:8081/health']) {
    await up(u, { headers: { authorization: 'Bearer client-token' } });
  }
  assert.ok(calls.every((c) => c.auth === null), JSON.stringify(calls));
  assert.equal(keyEligible('https://127.0.0.1:8081/health', new Set([8081])), false);
  assert.ok(UPSTREAM_KEY_PATHS.has('/v1/chat/completions') && !UPSTREAM_KEY_PATHS.has('/'));
  const ext = rec(); await withUpstreamKey(ext.f, 'HOSTKEY', new Set([8081]))('https://example.com/x', { headers: { authorization: 'Bearer keep' } });
  assert.equal(ext.calls[0].auth, 'Bearer keep', 'non-local URLs untouched');
});
test('SD-32: backendPorts comes from the manifest agents and variants', () => {
  const p = backendPorts({ agents: [{ port: 8081 }, { port: 8082, variants: [{ port: 8182 }] }, {}] });
  assert.deepEqual([...p].sort(), [8081, 8082, 8182]);
});
test('SD-32 (c): key redacted from error messages and gateway error bodies', async () => {
  assert.equal(redactKey('boom HOSTKEY boom', 'HOSTKEY'), 'boom [REDACTED] boom');
  const up = withUpstreamKey(async () => { throw new Error('connect failed with HOSTKEY'); }, 'HOSTKEY', new Set([8081]));
  await assert.rejects(up('http://127.0.0.1:8081/health'), (e) => !e.message.includes('HOSTKEY') && /\[REDACTED\]/.test(e.message));
  const gw = readFileSync(join(ROOT, 'src', 'gateway.mjs'), 'utf8');
  assert.match(gw, /message: redactKey\(redact\(error\.message\), this\.upstreamKey\)/);
  const pm = readFileSync(join(ROOT, 'src', 'process-manager.mjs'), 'utf8');
  assert.match(pm, /this\.fetch = withUpstreamKey\(fetchImpl, upstreamApiKey\(manifest\), backendPorts\(manifest\)\)/);
});
