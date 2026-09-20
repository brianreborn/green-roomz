#!/usr/bin/env node
/**
 * E2E coding-task eval.
 * Default: SMOKE + FAIL-FAST + OFFLINE (seconds). Do not hit :8080 unless asked.
 *
 *   node scripts/agent-e2e-eval.mjs
 *   node scripts/agent-e2e-eval.mjs --id E4
 *   node scripts/agent-e2e-eval.mjs --live
 *   node scripts/agent-e2e-eval.mjs --full --no-fail-fast --offline-only
 *
 * Env: GRZ_BASE_URL, GRZ_MODEL (defaults to qwenstral-code-speculator), GRZ_CHAT_TIMEOUT_MS
 * Flags: --smoke (default) --full --id E1,E4 --fail-fast (default) --no-fail-fast
 *        --offline-only (default) --live --live-only
 */
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runDevAgent } from '../src/dev-agent.mjs';
import { loadManifest } from '../src/config.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const suitePath = path.join(root, 'eval', 'agent-e2e.json');
const outPath = process.env.GRZ_E2E_OUT || path.join(root, 'data', 'agent-e2e-last.json');
const base = (process.env.GRZ_BASE_URL || 'http://127.0.0.1:8080').replace(/\/$/, '');
const defaultModel = process.env.GRZ_MODEL || 'qwenstral-code-speculator';
const argv = process.argv.slice(2);
function flagValue(flag) {
  const i = argv.indexOf(flag);
  if (i === -1) return null;
  return argv[i + 1] ?? null;
}
const full = argv.includes('--full');
const liveOnly = argv.includes('--live-only');
const wantLive = liveOnly || argv.includes('--live');
const failFast = !argv.includes('--no-fail-fast');
const idList = String(flagValue('--id') ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

function lastExec(result) {
  for (let i = (result.steps?.length ?? 0) - 1; i >= 0; i -= 1) {
    const r = result.steps[i]?.result;
    if (r && (r.code != null || r.stderr != null || r.stdout != null)) return r;
  }
  return null;
}

function scoreCase(c, result, workspace) {
  const fail = [];
  const exp = c.expect ?? { ok: true };
  if (exp.ok === true && !result.ok) fail.push(`ok false: ${String(result.summary).slice(0, 120)}`);
  if (exp.ok === false && result.ok) fail.push('expected not-ok');
  if (exp.stdoutRegex) {
    let src = String(exp.stdoutRegex);
    let flags = '';
    if (src.startsWith('(?i)')) { flags = 'i'; src = src.slice(4); }
    if (!new RegExp(src, flags).test(String(result.stdout ?? ''))) {
      fail.push(`stdout !~ ${exp.stdoutRegex} got ${JSON.stringify(String(result.stdout ?? '').slice(0, 80))}`);
    }
  }
  if (exp.files) {
    for (const f of exp.files) {
      if (!existsSync(path.join(workspace, f))) fail.push(`missing ${f}`);
    }
  }
  if (exp.fileContentRegex) {
    for (const [file, pattern] of Object.entries(exp.fileContentRegex)) {
      const filePath = path.join(workspace, file);
      if (!existsSync(filePath)) {
        fail.push(`missing ${file} for content check`);
        continue;
      }
      const content = readFileSync(filePath, 'utf8');
      if (!new RegExp(pattern, 'm').test(content)) fail.push(`${file} !~ ${pattern}`);
    }
  }
  const exec = lastExec(result);
  if (exp.code != null && Number(exec?.code) !== Number(exp.code)) {
    fail.push(`code ${exec?.code} != ${exp.code}`);
  }
  if (exp.stderrRegex) {
    const blob = `${exec?.stderr ?? ''} ${result.summary ?? ''}`;
    if (!new RegExp(exp.stderrRegex).test(blob)) fail.push(`stderr !~ ${exp.stderrRegex}`);
  }
  return fail;
}

async function healthOk() {
  try {
    const res = await fetch(`${base}/health`, { signal: AbortSignal.timeout(3_000) });
    return res.ok;
  } catch {
    return false;
  }
}

function deadline(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} deadline ${ms}ms`)), ms);
    promise.then((value) => { clearTimeout(timer); resolve(value); }, (error) => { clearTimeout(timer); reject(error); });
  });
}

function wrapChat(hits, timeoutMs) {
  return async (body) => {
    const t0 = Date.now();
    const ac = new AbortController();
    const work = (async () => {
      const res = await fetch(`${base}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ stream: false, ...body, lock_alias: true, model: body.model || defaultModel }),
        signal: ac.signal,
      });
      const json = await res.json().catch(() => null);
      const text = json?.choices?.[0]?.message?.content ?? json?.error?.message ?? '';
      hits.push({
        status: res.status,
        ms: Date.now() - t0,
        alias: res.headers.get('x-green-roomz-effective-alias'),
        reason: res.headers.get('x-green-roomz-route-reason'),
        preview: String(text).replace(/\s+/g, ' ').slice(0, 100),
      });
      return text;
    })();
    try {
      return await deadline(work, timeoutMs, 'chat');
    } catch (error) {
      ac.abort();
      hits.push({ status: 0, ms: Date.now() - t0, error: String(error.message ?? error) });
      throw error;
    }
  };
}

async function runCase(c, { live }) {
  const t0 = Date.now();
  const workspace = path.join(root, 'data', 'agent-e2e', live ? 'live' : 'offline', c.id);
  await rm(workspace, { recursive: true, force: true });
  await mkdir(workspace, { recursive: true });
  const hits = [];
  const chat = live ? wrapChat(hits, chatTimeoutMs) : undefined;
  try {
    const result = await runDevAgent({
      workspace,
      goal: c.goal,
      chat,
      model: defaultModel,
      lockAlias: true,
      maxSteps: c.maxSteps || 12,
      maxModelSteps: live ? (c.maxModelSteps ?? 1) : 0,
      maxTokens: live ? liveMaxTokens : 768,
      useFallback: c.useFallback !== false,
    });
    const fail = scoreCase(c, result, workspace);
    return {
      id: c.id,
      kind: c.kind,
      lang: c.lang,
      name: c.goal,
      live,
      status: fail.length ? 'FAIL' : 'PASS',
      detail: fail.join('; ') || `${result.summary} stdout=${JSON.stringify(String(result.stdout ?? '').trim().slice(0, 40))}`,
      ms: Date.now() - t0,
      ok: result.ok,
      stats: result.stats,
      gateway: hits,
      langUsed: result.lang,
    };
  } catch (error) {
    return {
      id: c.id, kind: c.kind, lang: c.lang, name: c.goal, live,
      status: 'FAIL', detail: String(error?.message ?? error), ms: Date.now() - t0,
    };
  }
}

const suite = JSON.parse(await readFile(suitePath, 'utf8'));
const manifest = await loadManifest();
const ANSWER_MS = 60_000;
const chatTimeoutMs = Math.min(
  ANSWER_MS,
  Number(process.env.GRZ_CHAT_TIMEOUT_MS) || Number(manifest.gateway.agent_chat_timeout_ms) || ANSWER_MS,
);
const liveMaxTokens = Number(manifest.gateway.agent_max_tokens) || 96;
const started = new Date().toISOString();
const results = [];

function selectCases(live) {
  if (idList.length) return suite.cases.filter((c) => idList.includes(c.id));
  if (full) return suite.cases;
  if (live) return suite.cases.filter((c) => c.liveSmoke);
  return suite.cases.filter((c) => c.smoke);
}

async function runPass(live) {
  const cases = selectCases(live);
  console.error(`--- ${live ? 'LIVE ' + base : 'OFFLINE'} n=${cases.length} fail-fast=${failFast} budget=${chatTimeoutMs}ms ---`);
  for (const c of cases) {
    const row = await runCase(c, { live });
    results.push(row);
    console.error(`[${live ? 'live' : 'off'} ${row.id}] ${row.status} ${row.kind}/${row.lang} (${row.ms}ms) ${row.detail}`);
    if (failFast && row.status === 'FAIL') {
      console.error('fail-fast: stopping');
      break;
    }
  }
}

const wantOffline = !liveOnly;
if (wantOffline) await runPass(false);
if (wantLive && !argv.includes('--offline-only')) {
  const up = await healthOk();
  if (!up) {
    const status = failFast ? 'FAIL' : 'SKIP';
    console.error(`gateway ${base}/health DOWN — ${failFast ? 'fail-fast HALT' : 'skip live'}`);
    results.push({ id: 'LIVE', status, detail: `no health at ${base}` });
  } else {
    await runPass(true);
  }
}

const pass = results.filter((r) => r.status === 'PASS').length;
const fail = results.filter((r) => r.status === 'FAIL').length;
const skip = results.filter((r) => r.status === 'SKIP').length;
const out = {
  schema: suite.schema,
  started,
  finished: new Date().toISOString(),
  base,
  model: defaultModel,
  pass, fail, skip,
  results,
};
await mkdir(path.dirname(outPath), { recursive: true });
await writeFile(outPath, `${JSON.stringify(out, null, 2)}\n`);
console.log(JSON.stringify({ pass, fail, skip, out: outPath }, null, 2));
if (fail) process.exitCode = 1;
