/**
 * Real end-to-end: a live gateway + live llama-server(s), real HTTP, real tokens.
 * Opt-in: GRZ_E2E=1 with llama.cpp + a small GGUF on disk (see harness.mjs).
 *
 *   GRZ_E2E=1 node --test test/e2e/e2e.test.mjs
 *
 * Assertions are strict on PROTOCOL and STABILITY, lenient on model quality
 * (the harness runs a 0.5B - it is not expected to be smart).
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { e2ePrereqs, writeTestManifest, startGateway, stopAll, freePortHint, delay } from './harness.mjs';

// C0 controls + DEL, minus \t \n \r
const CONTROL = new RegExp('[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F]');
const pre = e2ePrereqs();

describe('green-roomz end-to-end', { skip: pre.ok ? false : `e2e prereqs not met: ${pre.reason}`, timeout: 400_000 }, () => {
  let gw;
  let base;

  before(async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'grz-e2e-'));
    const gatewayPort = freePortHint(18800);
    const manifestPath = writeTestManifest({
      dir,
      nexusPort: freePortHint(18900),
      specialistPort: freePortHint(19000),
      gatewayPort,
      model: pre.model,
    });
    gw = await startGateway({ manifestPath, port: gatewayPort });
    base = gw.base;
  });

  after(async () => { await stopAll(); });

  const post = (p, body, headers = {}) => fetch(base + p, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

  it('GET / is operator HTML, not a JSON 404', async () => {
    const res = await fetch(base + '/');
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') ?? '', /text\/html/);
    const text = await res.text();
    assert.match(text, /OpenAI-compatible HTTP API/);
    assert.match(text, /not https/);
  });

  it('GET /health reports the product and an ok/degraded status', async () => {
    const res = await fetch(base + '/health');
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.product, 'Green-Roomz');
    assert.ok(['ok', 'degraded'].includes(json.status));
  });

  it('GET /v1/models lists the manifest aliases', async () => {
    const res = await fetch(base + '/v1/models');
    assert.equal(res.status, 200);
    const ids = (await res.json()).data.map((m) => m.id);
    assert.ok(ids.includes('tool-router-agent'));
    assert.ok(ids.includes('general-text-speculator'));
  });

  it('POST /v1/chat/completions returns a real, sanitized completion', async () => {
    const res = await post('/v1/chat/completions', {
      messages: [{ role: 'user', content: 'Reply with exactly the word: pong' }],
      max_tokens: 16,
    });
    assert.equal(res.status, 200);
    const json = await res.json();
    const content = json.choices?.[0]?.message?.content;
    assert.equal(typeof content, 'string');
    assert.ok(content.length > 0, 'non-empty assistant content');
    assert.doesNotMatch(content, CONTROL, 'no control/ESC bytes leaked');
    assert.equal(json.choices[0].message.reasoning_content, undefined, 'reasoning not leaked by default');
    assert.match(res.headers.get('x-green-roomz-effective-alias') ?? '', /\S/);
  });

  it('POST /v1/chat/completions/route returns a route plan without running the specialist', async () => {
    const res = await post('/v1/chat/completions/route', {
      messages: [{ role: 'user', content: 'write a python function that reverses a string' }],
    });
    assert.equal(res.status, 200);
    const json = await res.json();
    const plan = JSON.parse(json.choices[0].message.content);
    assert.match(String(plan.route ?? plan.reason_code ?? ''), /\S/);
    assert.match(res.headers.get('x-green-roomz-route-reason') ?? '', /\S/);
  });

  it('streaming responses are SSE and terminate with [DONE]', async () => {
    const res = await post('/v1/chat/completions', {
      messages: [{ role: 'user', content: 'Count: one two three' }],
      max_tokens: 24,
      stream: true,
    });
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') ?? '', /text\/event-stream/);
    const text = await res.text();
    assert.match(text, /^data: /m);
    assert.match(text, /\[DONE\]/);
    assert.doesNotMatch(text, CONTROL);
  });

  it('a session id is issued and a follow-up turn on it succeeds', async () => {
    const first = await post('/v1/chat/completions', {
      messages: [{ role: 'user', content: 'Say hi.' }], max_tokens: 8,
    });
    const sid = first.headers.get('x-green-roomz-session') ?? first.headers.get('x-session-id');
    assert.match(sid ?? '', /[0-9a-f-]{8,}/i);
    const second = await post('/v1/chat/completions', {
      messages: [{ role: 'user', content: 'And again.' }], max_tokens: 8,
    }, { 'x-session-id': sid });
    assert.equal(second.status, 200);
  });

  it('malformed JSON is a 400 and the gateway stays healthy', async () => {
    const res = await fetch(base + '/v1/chat/completions', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{not json',
    });
    assert.equal(res.status, 400);
    assert.equal((await fetch(base + '/health')).status, 200);
  });

  it('an oversized body is rejected fast without hanging', async () => {
    const started = Date.now();
    const res = await fetch(base + '/v1/chat/completions', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'x'.repeat(2 * 1024 * 1024) }] }),
    });
    assert.equal(res.status, 400);
    assert.ok(Date.now() - started < 15_000);
  });

  it('a client that hangs up mid-request does not crash the gateway', async () => {
    const ac = new AbortController();
    const p = fetch(base + '/v1/chat/completions', {
      method: 'POST', headers: { 'content-type': 'application/json' }, signal: ac.signal,
      body: JSON.stringify({ messages: [{ role: 'user', content: 'Write a long story about the sea.' }], max_tokens: 512 }),
    }).catch(() => {});
    await delay(300);
    ac.abort();
    await p;
    const res = await post('/v1/chat/completions', { messages: [{ role: 'user', content: 'ok?' }], max_tokens: 8 });
    assert.equal(res.status, 200);
  });

  it('killing a specialist backend degrades that route without hanging or crashing', async () => {
    await post('/v1/chat/completions', { model: 'general-text-speculator', lock_alias: true, messages: [{ role: 'user', content: 'hi' }], max_tokens: 4 });
    const { execSync } = await import('node:child_process');
    let killed = false;
    try {
      const cmd = process.platform === 'win32'
        ? 'powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name=\'llama-server.exe\'\\" | Select-Object -ExpandProperty ProcessId"'
        : 'pgrep -f llama-server';
      const out = execSync(cmd, { encoding: 'utf8' });
      const target = out.split(/\s+/).map(Number).filter(Boolean).sort((a, b) => b - a)[0];
      if (target) { process.kill(target, 'SIGKILL'); killed = true; }
    } catch { /* best effort */ }
    if (!killed) return;

    await delay(500);
    const started = Date.now();
    const res = await post('/v1/chat/completions', {
      model: 'general-text-speculator', lock_alias: true,
      messages: [{ role: 'user', content: 'still there?' }], max_tokens: 8,
    });
    assert.ok(Date.now() - started < 60_000, 'must not hang');
    assert.ok([502, 503, 504, 200].includes(res.status), `degraded status, got ${res.status}`);
    assert.equal((await fetch(base + '/health')).status, 200, 'gateway survived');
  });
});
