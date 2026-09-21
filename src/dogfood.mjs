/**
 * One unified diff from the local gateway. Dry-run unless GRZ_DOGFOOD_APPLY=1.
 *
 * POST {GRZ_BASE_URL|http://127.0.0.1:8080}/v1/chat/completions with lock_alias.
 * Model is qwenstral-code-speculator unless GRZ_DOGFOOD_MODEL is set.
 * Fallback when that alias is cold: GRZ_DOGFOOD_MODEL=general-text-speculator.
 * Apply is in-process. A non-zero test run restores the previous file bytes.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PREFERRED_MODEL = 'qwenstral-code-speculator';
/** Set GRZ_DOGFOOD_MODEL to this when qwenstral-code-speculator is cold. */
export const FALLBACK_MODEL = 'general-text-speculator';

export const DOGFOOD_SYSTEM = [
  'You edit the green-roomz repository.',
  'Reply with ONE unified diff and nothing else.',
  'Fence it as ```diff ... ```.',
  'The diff may only touch files under the repository root.',
  'Do not touch runtime/, models/, or .git/.',
  'Use repo-relative paths. No explanation outside the fence.',
].join(' ');

const HUNK_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;
const BLOCKED = new Set(['runtime', 'models', '.git']);

export function packageRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
}

export function resolveModel(env = process.env) {
  const picked = env.GRZ_DOGFOOD_MODEL;
  if (picked != null && String(picked).trim() !== '') return String(picked).trim();
  return PREFERRED_MODEL;
}

export function resolveBase(env = process.env) {
  return String(env.GRZ_BASE_URL || 'http://127.0.0.1:8080').replace(/\/$/, '');
}

export function wantsApply(apply, env = process.env) {
  if (typeof apply === 'boolean') return apply;
  return env.GRZ_DOGFOOD_APPLY === '1';
}

export function parseGoalArg(argv) {
  const args = [...argv];
  if (args[0] === 'dogfood') args.shift();
  const idx = args.indexOf('--goal');
  if (idx !== -1) return String(args[idx + 1] ?? '').trim();
  return args.filter((arg) => !arg.startsWith('-')).join(' ').trim();
}

export function vetRepoPath(raw) {
  if (raw == null) return { ok: false, reason: 'not a unified diff' };
  let text = String(raw).trim().replace(/\\/g, '/');
  const tab = text.indexOf('\t');
  if (tab !== -1) text = text.slice(0, tab).trim();
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    text = text.slice(1, -1);
  }
  if (text === '/dev/null') return { ok: true, devNull: true };
  if (/^[ab]\//.test(text)) text = text.slice(2);
  if (text === '/dev/null') return { ok: true, devNull: true };
  if (text.startsWith('/') || /^[A-Za-z]:/.test(text) || text.includes('\0')) {
    return { ok: false, reason: 'path outside repo' };
  }
  const parts = [];
  for (const seg of text.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') return { ok: false, reason: 'path outside repo' };
    parts.push(seg);
  }
  if (parts.length === 0) return { ok: false, reason: 'not a unified diff' };
  const blocked = parts.find((seg) => BLOCKED.has(seg.toLowerCase()));
  if (blocked) {
    const label = blocked.toLowerCase() === '.git' ? '.git/' : `${blocked.toLowerCase()}/`;
    return { ok: false, reason: `touches ${label}` };
  }
  return { ok: true, rel: parts.join('/') };
}

export function extractFencedDiff(text) {
  const raw = String(text ?? '');
  const found = [];
  const re = /```diff\b[^\n]*\r?\n([\s\S]*?)```/gi;
  for (const match of raw.matchAll(re)) found.push(match[1]);
  if (found.length !== 1) return null;
  const body = found[0].replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\s+$/, '');
  if (!body) return null;
  return `${body}\n`;
}

function headerPath(rest) {
  const trimmed = String(rest).trim();
  const tab = trimmed.indexOf('\t');
  return (tab === -1 ? trimmed : trimmed.slice(0, tab)).trim();
}

export function parseUnifiedDiff(diffText) {
  const text = String(diffText ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (!/^diff --git /m.test(text) || !/^@@ /m.test(text)) {
    return { ok: false, reason: 'not a unified diff' };
  }
  const lines = text.split('\n');
  const files = [];
  let cur = null;
  let hunk = null;
  const finishHunk = () => {
    if (hunk && cur) cur.hunks.push(hunk);
    hunk = null;
  };
  const finishFile = () => {
    finishHunk();
    if (cur) files.push(cur);
    cur = null;
  };
  for (const line of lines) {
    if (line.startsWith('diff --git ')) {
      finishFile();
      cur = { oldPath: null, newPath: null, hunks: [] };
      continue;
    }
    if (hunk) {
      const next = HUNK_RE.exec(line);
      if (next) {
        finishHunk();
        hunk = hunkFrom(next);
        continue;
      }
      if (line === '') {
        finishHunk();
        continue;
      }
      if (/^[ +\-\\]/.test(line)) {
        hunk.lines.push(line);
        continue;
      }
      return { ok: false, reason: 'not a unified diff' };
    }
    if (!cur && line === '') continue;
    if (!cur) return { ok: false, reason: 'not a unified diff' };
    if (line.startsWith('--- ')) {
      cur.oldPath = headerPath(line.slice(4));
      continue;
    }
    if (line.startsWith('+++ ')) {
      cur.newPath = headerPath(line.slice(4));
      continue;
    }
    const header = HUNK_RE.exec(line);
    if (header) {
      hunk = hunkFrom(header);
      continue;
    }
    if (line === '' || /^(index |new file mode |deleted file mode |old mode |new mode |similarity index |rename |copy |Binary files )/.test(line)) {
      continue;
    }
    return { ok: false, reason: 'not a unified diff' };
  }
  finishFile();
  if (files.length === 0 || files.some((file) => file.hunks.length === 0)) {
    return { ok: false, reason: 'not a unified diff' };
  }
  for (const file of files) {
    for (const one of file.hunks) {
      const seen = countHunk(one.lines);
      if (seen.oldC !== one.oldCount || seen.newC !== one.newCount) {
        return { ok: false, reason: 'not a unified diff' };
      }
    }
  }
  return { ok: true, files };
}

function hunkFrom(match) {
  return {
    oldStart: Number(match[1]),
    oldCount: match[2] == null ? 1 : Number(match[2]),
    newStart: Number(match[3]),
    newCount: match[4] == null ? 1 : Number(match[4]),
    lines: [],
  };
}

function countHunk(hunkLines) {
  let oldC = 0;
  let newC = 0;
  for (const line of hunkLines) {
    if (line.startsWith('\\')) continue;
    if (line.startsWith(' ')) {
      oldC += 1;
      newC += 1;
    } else if (line.startsWith('-')) oldC += 1;
    else if (line.startsWith('+')) newC += 1;
  }
  return { oldC, newC };
}

export function reviewDiff(diffText) {
  const fenced = extractFencedDiff(diffText);
  if (!fenced) return { ok: false, reason: 'missing diff', diff: null };
  const parsed = parseUnifiedDiff(fenced);
  if (!parsed.ok) return { ...parsed, diff: fenced };
  const files = [];
  const seen = new Set();
  for (const file of parsed.files) {
    const oldV = vetRepoPath(file.oldPath);
    const newV = vetRepoPath(file.newPath);
    if (!oldV.ok) return { ...oldV, diff: fenced };
    if (!newV.ok) return { ...newV, diff: fenced };
    if (oldV.devNull && newV.devNull) return { ok: false, reason: 'not a unified diff', diff: fenced };
    if (!oldV.devNull && !newV.devNull && oldV.rel !== newV.rel) {
      return { ok: false, reason: 'not a unified diff', diff: fenced };
    }
    const rel = newV.devNull ? oldV.rel : newV.rel;
    if (seen.has(rel)) return { ok: false, reason: 'not a unified diff', diff: fenced };
    seen.add(rel);
    files.push({
      rel,
      created: Boolean(oldV.devNull),
      deleted: Boolean(newV.devNull),
      hunks: file.hunks,
    });
  }
  if (files.length === 0) return { ok: false, reason: 'not a unified diff', diff: fenced };
  return { ok: true, diff: fenced, files };
}

function sourceLines(original) {
  if (original === '') return [];
  const norm = original.replace(/\r\n/g, '\n');
  const ends = norm.endsWith('\n');
  const core = ends ? norm.slice(0, -1) : norm;
  if (core === '') return [''];
  return core.split('\n');
}

export function applyHunks(original, hunks) {
  const lines = sourceLines(original);
  const out = [];
  let src = 0;
  let noNl = false;
  for (const hunk of hunks) {
    const target = hunk.oldStart === 0 ? 0 : hunk.oldStart - 1;
    if (target < src || target > lines.length) throw new Error('hunk starts past end of file');
    while (src < target) {
      out.push(lines[src]);
      src += 1;
    }
    for (const raw of hunk.lines) {
      if (raw.startsWith('\\')) {
        noNl = true;
        continue;
      }
      noNl = false;
      const tag = raw[0];
      const body = raw.slice(1);
      if (tag === ' ' || tag === '-') {
        if (lines[src] !== body) throw new Error('context mismatch');
        if (tag === ' ') out.push(lines[src]);
        src += 1;
      } else if (tag === '+') {
        out.push(body);
      } else {
        throw new Error('not a unified diff');
      }
    }
  }
  while (src < lines.length) {
    out.push(lines[src]);
    src += 1;
  }
  if (out.length === 0) return '';
  const joined = out.join('\n');
  return noNl ? joined : `${joined}\n`;
}

function absInside(repoRoot, rel) {
  const root = path.resolve(repoRoot);
  const abs = path.resolve(root, ...rel.split('/'));
  const relTo = path.relative(root, abs);
  if (relTo.startsWith('..') || path.isAbsolute(relTo)) throw new Error('path outside repo');
  return abs;
}

function snapshot(repoRoot, files) {
  return files.map((file) => {
    const abs = absInside(repoRoot, file.rel);
    try {
      return { abs, existed: true, data: readFileSync(abs) };
    } catch (error) {
      if (error.code === 'ENOENT') return { abs, existed: false, data: null };
      throw error;
    }
  });
}

function restore(snaps) {
  for (const snap of snaps) {
    if (!snap.existed) {
      try { unlinkSync(snap.abs); } catch { /* already gone */ }
    } else {
      mkdirSync(path.dirname(snap.abs), { recursive: true });
      writeFileSync(snap.abs, snap.data);
    }
  }
}

export function testFilesFor(rels) {
  const out = ['test/dogfood.test.mjs'];
  for (const rel of rels) {
    const norm = String(rel).replace(/\\/g, '/');
    if (/\.test\.mjs$/.test(norm) && !out.includes(norm)) out.push(norm);
  }
  return out;
}

export function spawnNodeTests(files, { cwd } = {}) {
  const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...files], {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
  });
  return {
    status: result.status == null ? 1 : result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function completionText(json) {
  const choice = json?.choices?.[0];
  const content = choice?.message?.content ?? choice?.delta?.content ?? choice?.text ?? '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((part) => (typeof part === 'string' ? part : part?.text ?? '')).join('');
  }
  return '';
}

async function readGatewayText(res) {
  const type = String(res.headers?.get?.('content-type') ?? '');
  if (!type.includes('event-stream') && typeof res.json === 'function') {
    return completionText(await res.json());
  }
  const reader = res.body?.getReader?.();
  if (!reader) {
    if (typeof res.text === 'function') return assembleSse(await res.text());
    return '';
  }
  const dec = new TextDecoder();
  let raw = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    raw += dec.decode(value, { stream: true });
  }
  return assembleSse(raw);
}

function assembleSse(raw) {
  let out = '';
  for (const line of String(raw).split(/\r?\n/)) {
    if (!line.startsWith('data:')) continue;
    const data = line.slice(5).trim();
    if (!data || data === '[DONE]') continue;
    try { out += completionText(JSON.parse(data)); } catch { /* comment or partial */ }
  }
  return out;
}

function exitStatus(outcome) {
  if (typeof outcome === 'number') return outcome;
  if (outcome && typeof outcome.status === 'number') return outcome.status;
  return 1;
}

function userPrompt(goal) {
  return `${goal}\n\nReply with ONE unified diff fenced as \`\`\`diff ... \`\`\` and nothing else. Touch only files under the repository root.`;
}

export async function runDogfood({
  goal,
  repoRoot = packageRoot(),
  base,
  model,
  apply,
  fetchImpl = globalThis.fetch,
  runTests,
  timeoutMs,
  env = process.env,
} = {}) {
  const textGoal = String(goal ?? '').trim();
  if (!textGoal) return { ok: false, applied: false, reverted: false, reason: 'goal required' };
  const url = `${base ? String(base).replace(/\/$/, '') : resolveBase(env)}/v1/chat/completions`;
  const chosen = model || resolveModel(env);
  const ms = timeoutMs == null ? Number(env.GRZ_DOGFOOD_TIMEOUT_MS || 600_000) : Number(timeoutMs);
  const maxTokens = Number(env.GRZ_DOGFOOD_MAX_TOKENS || 2048);
  const payload = {
    model: chosen,
    lock_alias: true,
    stream: true,
    max_tokens: Number.isFinite(maxTokens) && maxTokens > 0 ? maxTokens : 2048,
    messages: [
      { role: 'system', content: DOGFOOD_SYSTEM },
      { role: 'user', content: userPrompt(textGoal) },
    ],
  };
  const init = {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  };
  if (Number.isFinite(ms) && ms > 0) init.signal = AbortSignal.timeout(ms);
  let content = '';
  try {
    const res = await fetchImpl(url, init);
    if (!res || typeof res.json !== 'function') throw new Error('bad gateway response');
    if (res.ok === false) throw new Error(`gateway HTTP ${res.status ?? ''}`);
    content = await readGatewayText(res);
  } catch (error) {
    return { ok: false, applied: false, reverted: false, reason: error.message || 'gateway failed' };
  }
  const reviewed = reviewDiff(content);
  if (!reviewed.ok) {
    return { ok: false, applied: false, reverted: false, reason: reviewed.reason, diff: reviewed.diff ?? null };
  }
  const doApply = wantsApply(apply, env);
  if (!doApply) {
    return {
      ok: true,
      applied: false,
      dryRun: true,
      reverted: false,
      reason: null,
      diff: reviewed.diff,
      files: reviewed.files.map((file) => file.rel),
    };
  }
  let rendered;
  try {
    rendered = reviewed.files.map((file) => {
      const abs = absInside(repoRoot, file.rel);
      if (file.deleted) return { ...file, abs, next: null };
      let original = '';
      if (!file.created) {
        if (!existsSync(abs)) throw new Error(`missing ${file.rel}`);
        original = readFileSync(abs, 'utf8');
      } else if (existsSync(abs)) {
        original = readFileSync(abs, 'utf8');
      }
      return { ...file, abs, next: applyHunks(original, file.hunks) };
    });
  } catch (error) {
    return { ok: false, applied: false, reverted: false, reason: error.message || 'apply failed', diff: reviewed.diff };
  }
  let snaps = null;
  try {
    snaps = snapshot(repoRoot, rendered);
    for (const item of rendered) {
      if (item.deleted) {
        if (existsSync(item.abs)) unlinkSync(item.abs);
        continue;
      }
      mkdirSync(path.dirname(item.abs), { recursive: true });
      writeFileSync(item.abs, item.next, 'utf8');
    }
    const targets = testFilesFor(rendered.map((item) => item.rel));
    const tester = runTests ?? ((files, ctx) => spawnNodeTests(files, { cwd: ctx.cwd }));
    const outcome = await tester(targets, { cwd: path.resolve(repoRoot), repoRoot });
    const status = exitStatus(outcome);
    if (status !== 0) {
      restore(snaps);
      return {
        ok: false,
        applied: false,
        reverted: true,
        reason: 'tests failed',
        status,
        diff: reviewed.diff,
        stdout: outcome?.stdout ?? '',
        stderr: outcome?.stderr ?? '',
        files: rendered.map((item) => item.rel),
      };
    }
    return {
      ok: true,
      applied: true,
      dryRun: false,
      reverted: false,
      status,
      diff: reviewed.diff,
      files: rendered.map((item) => item.rel),
    };
  } catch (error) {
    if (snaps) restore(snaps);
    return {
      ok: false,
      applied: false,
      reverted: Boolean(snaps),
      reason: error.message || 'apply failed',
      diff: reviewed.diff,
    };
  }
}

export async function main(argv = process.argv.slice(2)) {
  const goal = parseGoalArg(argv);
  const result = await runDogfood({ goal });
  if (result.dryRun && result.ok && result.diff) process.stdout.write(result.diff);
  if (!result.ok) {
    console.error(result.reason || 'dogfood failed');
    if (result.stderr) console.error(result.stderr);
    process.exitCode = 1;
  } else if (result.applied) {
    console.error('dogfood: applied');
  }
  return result;
}

function invokedDirectly() {
  const entry = process.argv[1];
  if (!entry) return false;
  return path.resolve(entry).toLowerCase() === path.resolve(fileURLToPath(import.meta.url)).toLowerCase();
}

if (invokedDirectly()) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
