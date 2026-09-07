#!/usr/bin/env node
/**
 * Standardized agent eval against an OpenAI-compatible chat endpoint.
 * Default: http://127.0.0.1:8080  model general-text-speculator
 *
 * Env: GRZ_BASE_URL, GRZ_MODEL, GRZ_EVAL_STRICT=1 (quality misses fail process)
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadManifest } from '../src/config.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const suitePath = path.join(root, 'eval', 'agent-std.json');
const outPath = process.env.GRZ_EVAL_OUT || path.join(root, 'data', 'agent-std-last.json');
const base = (process.env.GRZ_BASE_URL || 'http://127.0.0.1:8080').replace(/\/$/, '');
const defaultModel = process.env.GRZ_MODEL || 'general-text-speculator';
const strict = process.env.GRZ_EVAL_STRICT === '1';

function extractJson(text) {
  const raw = String(text ?? '').trim();
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fence ? fence[1] : raw;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(body.slice(start, end + 1)); } catch { return null; }
}

function scoreExpect(expect, { status, json, text, models }) {
  const fail = [];
  if (expect.status != null && Number(status) !== Number(expect.status)) {
    fail.push(`status ${status} != ${expect.status}`);
  }
  if (expect.object && json?.object !== expect.object) fail.push(`object ${json?.object}`);
  if (expect.role && json?.choices?.[0]?.message?.role !== expect.role) fail.push('role');
  if (expect.nonempty && !String(text ?? '').trim()) fail.push('empty content');
  if (expect.contentRegex) {
    let src = String(expect.contentRegex);
    let flags = '';
    if (src.startsWith('(?i)')) { flags = 'i'; src = src.slice(4); }
    const re = new RegExp(src, flags);
    if (!re.test(String(text ?? ''))) fail.push(`regex ${expect.contentRegex}`);
  }
  if (expect.minBulletLines) {
    const n = String(text ?? '').split(/\r?\n/).filter((l) => /^\s*[-*]\s+\S/.test(l)).length;
    if (n < expect.minBulletLines) fail.push(`bullets ${n}<${expect.minBulletLines}`);
  }
  if (expect.jsonKeys) {
    const obj = extractJson(text);
    if (!obj) fail.push('not json');
    else for (const k of expect.jsonKeys) if (!Object.hasOwn(obj, k)) fail.push(`missing key ${k}`);
  }
  if (expect.modelsInclude) {
    const ids = (models ?? []).map((m) => m.id);
    for (const id of expect.modelsInclude) if (!ids.includes(id)) fail.push(`missing model ${id}`);
  }
  return fail;
}

async function chat(messages, { model, max_tokens, lock_alias }) {
  const res = await fetch(`${base}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model, messages, max_tokens, stream: false, ...(lock_alias ? { lock_alias: true } : {}) }),
    signal: AbortSignal.timeout(chatTimeoutMs),
  });
  const raw = await res.text();
  let json = null;
  try { json = JSON.parse(raw); } catch { json = null; }
  const text = json?.choices?.[0]?.message?.content ?? json?.error?.message ?? raw;
  return { status: res.status, json, text, raw };
}

async function runCase(c) {
  const t0 = Date.now();
  const model = c.model || defaultModel;
  try {
    if (c.method === 'GET') {
      const res = await fetch(`${base}${c.path || '/v1/models'}`);
      const json = await res.json();
      const fail = scoreExpect(c.expect, { status: res.status, json, models: json.data });
      return { id: c.id, family: c.family, name: c.name, gate: c.gate, status: fail.length ? 'FAIL' : 'PASS', detail: fail.join('; ') || `http=${res.status}`, ms: Date.now() - t0 };
    }
    let messages = c.messages;
    if (c.turns) {
      const first = await chat(c.turns[0].messages, { model, max_tokens: c.max_tokens, lock_alias: c.lock_alias });
      if (first.status >= 400) {
        return { id: c.id, family: c.family, name: c.name, gate: c.gate, status: 'FAIL', detail: `turn1 http=${first.status} ${String(first.text).slice(0, 120)}`, ms: Date.now() - t0 };
      }
      messages = [
        ...c.turns[0].messages,
        { role: 'assistant', content: first.text },
        { role: 'user', content: c.turns[1].followUp },
      ];
    }
    const r = await chat(messages, { model, max_tokens: c.max_tokens, lock_alias: c.lock_alias });
    const fail = scoreExpect(c.expect, r);
    const ok = fail.length === 0;
    return {
      id: c.id,
      family: c.family,
      name: c.name,
      gate: c.gate,
      status: ok ? 'PASS' : 'FAIL',
      detail: ok ? `http=${r.status} ${(r.text || '').replace(/\s+/g, ' ').slice(0, 80)}` : fail.join('; ') + ` | ${(r.text || '').replace(/\s+/g, ' ').slice(0, 80)}`,
      ms: Date.now() - t0,
    };
  } catch (error) {
    return { id: c.id, family: c.family, name: c.name, gate: c.gate, status: 'FAIL', detail: String(error?.message ?? error), ms: Date.now() - t0 };
  }
}

const suite = JSON.parse(await readFile(suitePath, 'utf8'));
const manifest = await loadManifest();
const chatTimeoutMs = Number(process.env.GRZ_CHAT_TIMEOUT_MS) || Number(manifest.gateway.agent_chat_timeout_ms);
const failFast = !process.argv.includes('--no-fail-fast');
const started = new Date().toISOString();
const results = [];
for (const c of suite.cases) {
  const row = await runCase(c);
  results.push(row);
  console.log(`[${row.id}] ${row.status} ${row.name} (${row.ms}ms)`);
  if (row.detail) console.log(`       ${row.detail}`);
  if (failFast && row.gate === 'protocol' && row.status === 'FAIL') {
    console.error('fail-fast: protocol FAIL, skipping remaining cases');
    break;
  }
}

const protocol = results.filter((r) => r.gate === 'protocol');
const quality = results.filter((r) => r.gate === 'quality');
const tally = (rows) => ({
  pass: rows.filter((r) => r.status === 'PASS').length,
  fail: rows.filter((r) => r.status === 'FAIL').length,
  total: rows.length,
});
const report = {
  schema: 'green-roomz.agent-std-last.v1',
  suite: suite.schema,
  base_url: base,
  model: defaultModel,
  started_utc: started,
  finished_utc: new Date().toISOString(),
  protocol: tally(protocol),
  quality: tally(quality),
  cases: results,
};
await mkdir(path.dirname(outPath), { recursive: true });
await writeFile(outPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ protocol: report.protocol, quality: report.quality, out: outPath }, null, 2));

const protocolFail = report.protocol.fail > 0;
const qualityFail = strict && report.quality.fail > 0;
process.exit(protocolFail || qualityFail ? 1 : 0);
