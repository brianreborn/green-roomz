import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AgentRegistry } from '../src/registry.mjs';
import { ProcessManager } from '../src/process-manager.mjs';
import { PolicyGate } from '../src/scheduler.mjs';
import { SessionLedger } from '../src/sessions.mjs';
import { Gateway, decodeDataUrl } from '../src/gateway.mjs';
import { sampleManifest } from './helpers.mjs';

const REPO = path.resolve(fileURLToPath(new URL('../', import.meta.url)));

test('decodeDataUrl handles base64 and percent-encoded payloads', () => {
  const b64 = decodeDataUrl('data:audio/wav;base64,' + Buffer.from('RIFF....').toString('base64'));
  assert.equal(b64.mime, 'audio/wav');
  assert.equal(b64.ext, 'wav');
  assert.equal(b64.bytes.toString(), 'RIFF....');
  assert.equal(decodeDataUrl('data:text/plain,hello%20world').bytes.toString(), 'hello world');
  assert.equal(decodeDataUrl('not a data url'), null);
});

async function audioGateway(fetchImpl) {
  const manifest = sampleManifest();
  const registry = await new AgentRegistry(manifest).inspect();
  registry.setStatus('audio-transcription-agent', 'ready');
  const processes = new ProcessManager({ manifest, registry, hostAdapter: { sampleResources: () => ({ freeMemoryBytes: 1e9 }) }, spawnImpl() { throw new Error('no spawn'); } });
  processes.ensure = async (agent) => ({ alias: agent.alias, state: 'ready' });
  const gateway = new Gateway({ manifest, registry, processes, sessions: new SessionLedger(), policy: new PolicyGate('maximize'), fetchImpl });
  const server = await gateway.listen('127.0.0.1', 0);
  return { gateway, server, base: `http://127.0.0.1:${server.address().port}` };
}

test('the whisper native path posts multipart/form-data and unwraps { text }', async (t) => {
  let seenInit;
  const { server, base } = await audioGateway(async (_url, init) => {
    seenInit = init;
    return { status: 200, text: async () => JSON.stringify({ text: '  Hello world.  ' }) };
  });
  t.after(() => server.close());

  const res = await fetch(base + '/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'audio-transcription-agent', lock_alias: true,
      messages: [{ role: 'user', content: [{ type: 'input_audio', input_audio: { data: 'data:audio/wav;base64,' + Buffer.from('RIFFxxxx').toString('base64') } }] }],
    }),
  });
  assert.equal(res.status, 200);
  assert.ok(seenInit.body instanceof FormData, 'multipart body');
  assert.ok(seenInit.body.get('file'), 'file part present');
  assert.equal(String(seenInit.headers?.['content-type'] ?? ''), '', 'no manual JSON content-type (fetch sets the multipart boundary)');
  const json = await res.json();
  assert.equal(json.choices[0].message.content, 'Hello world.', 'trimmed transcription');
  assert.equal(res.headers.get('x-green-roomz-effective-alias'), 'audio-transcription-agent');
});

test('the whisper path rejects a non-decodable audio part cleanly (no crash)', async (t) => {
  const { server, base } = await audioGateway(async () => ({ status: 200, text: async () => '{}' }));
  t.after(() => server.close());
  const res = await fetch(base + '/v1/chat/completions', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'audio-transcription-agent', lock_alias: true, messages: [{ role: 'user', content: '/audio only text, no part' }] }),
  });
  assert.equal(res.status, 400);
  assert.equal((await fetch(base + '/health')).status, 200);
});

// --- optional real round-trip: gateway -> real whisper-server -> transcription ---

const WHISPER = process.env.GRZ_E2E_WHISPER || 'C:/LocalAI/whisper/whisper-server.exe';
const WMODEL = process.env.GRZ_E2E_WHISPER_MODEL || 'C:/LocalAI/whisper/models/ggml-small.bin';
const asset = path.join(REPO, 'e2e', 'assets', 'hello-world.wav');
// Runs whenever whisper-server + model + fixture are present (they are on any
// green-roomz host). Only an environment without whisper skips it - never opt-in.
const realOk = existsSync(WHISPER) && existsSync(WMODEL) && existsSync(asset);

test('real audio round-trip through whisper-server', { skip: realOk ? false : `whisper-server / model / fixture missing (${WHISPER})`, timeout: 180_000 }, async (t) => {
  const { spawn } = await import('node:child_process');
  const port = 18700 + Math.floor(Math.random() * 200);
  const whisper = spawn(WHISPER, ['--host', '127.0.0.1', '--port', String(port), '--model', WMODEL], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  t.after(() => whisper.kill('SIGKILL'));
  for (let i = 0; i < 240; i += 1) {
    try { if ((await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(1500) })).status) break; } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  const manifest = sampleManifest();
  manifest.runtimes.whisper.command = process.execPath; // ensure() is stubbed; command just must exist
  const registry = await new AgentRegistry(manifest).inspect();
  const agent = manifest.agents.find((a) => a.alias === 'audio-transcription-agent');
  agent.port = port;
  registry.setStatus('audio-transcription-agent', 'ready');
  const processes = new ProcessManager({ manifest, registry, spawnImpl() { throw new Error('no spawn'); } });
  processes.ensure = async (a) => ({ alias: a.alias, state: 'ready' });
  const gateway = new Gateway({ manifest, registry, processes, sessions: new SessionLedger(), policy: new PolicyGate('maximize') });
  const server = await gateway.listen('127.0.0.1', 0);
  t.after(() => server.close());

  const wav = readFileSync(asset).toString('base64');
  const res = await fetch(`http://127.0.0.1:${server.address().port}/v1/chat/completions`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'audio-transcription-agent', lock_alias: true, messages: [{ role: 'user', content: [{ type: 'input_audio', input_audio: { data: `data:audio/wav;base64,${wav}` } }] }] }),
  });
  assert.equal(res.status, 200);
  const text = (await res.json()).choices[0].message.content;
  assert.match(text, /hello,?\s*world/i, `transcription was: ${text}`);
});

test('the image native path posts a txt2img prompt and wraps b64_json as an image part', async (t) => {
  const manifest = sampleManifest();
  const registry = await new AgentRegistry(manifest).inspect();
  registry.setStatus('image-generation-agent', 'ready');
  const processes = new ProcessManager({ manifest, registry, spawnImpl() { throw new Error('no spawn'); } });
  processes.ensure = async (a) => ({ alias: a.alias, state: 'ready' });
  let seen;
  const gateway = new Gateway({
    manifest, registry, processes, sessions: new SessionLedger(), policy: new PolicyGate('maximize'),
    fetchImpl: async (_url, init) => { seen = JSON.parse(init.body); return { status: 200, text: async () => JSON.stringify({ data: [{ b64_json: 'aGVsbG8=' }] }) }; },
  });
  const server = await gateway.listen('127.0.0.1', 0);
  t.after(() => server.close());
  const res = await fetch(`http://127.0.0.1:${server.address().port}/v1/chat/completions`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'image-generation-agent', lock_alias: true, messages: [{ role: 'user', content: '/image a red apple on a table' }] }),
  });
  assert.equal(res.status, 200);
  assert.equal(seen.prompt, 'a red apple on a table');
  const content = (await res.json()).choices[0].message.content;
  assert.equal(content[0].type, 'image_url');
  assert.match(content[0].image_url.url, /^data:image\/png;base64,aGVsbG8=$/);
});
