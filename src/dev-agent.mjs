import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import {
  binAllowed,
  canonicalExt,
  clip,
  detectLang,
  isTestPath,
  parseGoal,
  probeRuntimes,
  registerRuntime,
  resolveRuntime,
  runFile as runAbs,
  sourcesFor,
} from './dev-lang.mjs';

export { canonicalExt, detectLang, parseGoal, probeRuntimes, registerRuntime, resolveRuntime };
export { clearExtra, clearProbeCache, namesFor, sourcesFor } from './dev-lang.mjs';

export function jail(workspace, rel) {
  const root = path.resolve(workspace);
  const abs = path.resolve(root, rel ?? '.');
  const relTo = path.relative(root, abs);
  if (relTo.startsWith('..') || path.isAbsolute(relTo)) throw new Error(`path escapes workspace: ${rel}`);
  return abs;
}

export function parseAction(text) {
  const raw = String(text ?? '');
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const obj = JSON.parse(raw.slice(start, end + 1));
    if (obj && typeof obj === 'object') return obj;
  } catch { /* fall through */ }
  return null;
}

export function fallbackPlan(goal, spec = parseGoal(goal)) {
  const sources = sourcesFor(spec);
  const steps = [];
  const seen = new Set();
  for (const key of ['lib', 'main', 'test']) {
    const file = sources[key];
    if (!file?.path || seen.has(file.path)) continue;
    seen.add(file.path);
    steps.push({ tool: 'write', path: file.path, content: file.content });
  }
  const runPath = spec.wantsTest && sources.test
    ? sources.test.path
    : (sources.main?.path || sources.lib?.path);
  if (runPath) {
    const runStep = { tool: spec.wantsTest ? 'test' : 'run', path: runPath };
    if (spec.cliArgs) runStep.args = spec.cliArgs;
    steps.push(runStep);
  }
  const label = spec.wantsTest ? `wrote and tested ${runPath}` : `wrote and ran ${runPath}`;
  steps.push({ done: true, summary: label });
  return steps;
}

export function runtimeFor(filePath, state) {
  const ext = path.extname(filePath).toLowerCase();
  return state?.learned?.[ext] || null;
}

export async function runFile(workspace, rel, state = {}, opts = {}) {
  const abs = jail(workspace, rel);
  return runAbs(workspace, abs, rel, state, opts);
}

const TOOLS = new Set(['write', 'read', 'run', 'test', 'list', 'probe', 'runtime']);
/** Tool-result / write-content bound in the next model prompt. Athlon 0.5B cannot use 4k of ramble. */
const HISTORY_CLIP = 800;

export function validAction(action) {
  if (!action || typeof action !== 'object') return false;
  if (action.done) return true;
  return TOOLS.has(action.tool);
}

function historyAction(action, n = HISTORY_CLIP) {
  if (!action || typeof action !== 'object') return action;
  if (typeof action.content !== 'string') return action;
  const content = clip(action.content, n);
  return content === action.content ? action : { ...action, content };
}

export async function execTool(workspace, action, state = {}) {
  if (action.done) return { ok: true, done: true, summary: action.summary ?? 'done' };
  const tool = action.tool;
  if (tool === 'probe') {
    const want = action.ext || (action.path ? path.extname(action.path) : null);
    const runtimes = await probeRuntimes(state, want ? { exts: [want] } : {});
    const available = Object.entries(runtimes)
      .filter(([, v]) => v)
      .map(([ext, v]) => ({ ext, bin: v.bin, version: v.version ?? null }));
    return { ok: true, available, missing: Object.keys(runtimes).filter((ext) => !runtimes[ext]) };
  }
  if (tool === 'runtime') {
    try {
      const registered = registerRuntime(action.ext || action.path, { bin: action.bin, args: action.args || [] }, state);
      return { ok: true, ...registered };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  }
  if (tool === 'list') {
    const dir = jail(workspace, action.path || '.');
    const names = await readdir(dir);
    return { ok: true, entries: names };
  }
  if (tool === 'read') {
    if (!action.path) return { ok: false, error: 'path required' };
    const abs = jail(workspace, action.path);
    const content = await readFile(abs, 'utf8');
    return { ok: true, path: action.path, content: clip(content) };
  }
  if (tool === 'write') {
    if (!action.path) return { ok: false, error: 'path required' };
    const abs = jail(workspace, action.path);
    await mkdir(path.dirname(abs), { recursive: true });
    await writeFile(abs, String(action.content ?? ''), 'utf8');
    const ext = path.extname(abs).toLowerCase();
    if (ext) await resolveRuntime(ext, state);
    return { ok: true, path: action.path, bytes: Buffer.byteLength(String(action.content ?? '')) };
  }
  if (tool === 'run' || tool === 'test') {
    if (!action.path) return { ok: false, error: 'path required' };
    const extra = Array.isArray(action.args) ? action.args.map(String) : [];
    const result = await runFile(workspace, action.path, state, { args: extra });
    return { ok: result.code === 0, ...result, path: action.path, test: tool === 'test' || isTestPath(action.path) };
  }
  return { ok: false, error: `unknown tool ${tool}` };
}

const SYSTEM = `Coding agent. Jail workspace. One JSON object only:
{"tool":"write","path":"rel/file.ext","content":"..."}
{"tool":"read","path":"rel/file.ext"}
{"tool":"run","path":"rel/file.ext"}
{"tool":"test","path":"rel/file.ext"}
{"tool":"list","path":"."}
{"tool":"probe"}
{"tool":"runtime","ext":".lua","bin":"lua","args":[]}
{"done":true,"summary":"..."}
Fix compile/runtime errors then run/test. No prose.`;

async function loadLearn(workspace, state) {
  try {
    const raw = JSON.parse(await readFile(jail(workspace, '.grz/learn.json'), 'utf8'));
    if (raw?.runtimes && typeof raw.runtimes === 'object') {
      for (const [ext, row] of Object.entries(raw.runtimes)) {
        if (row?.bin && binAllowed(row.bin)) state.learned[ext] = { bin: row.bin, args: row.args || [] };
      }
    }
  } catch { /* first run */ }
}

async function saveLearn(workspace, state) {
  const dir = jail(workspace, '.grz');
  await mkdir(dir, { recursive: true });
  const runtimes = {};
  for (const [ext, row] of Object.entries(state.learned || {})) {
    if (row?.bin) runtimes[ext] = { bin: row.bin, args: row.args || [], version: row.version || null };
  }
  await writeFile(path.join(dir, 'learn.json'), `${JSON.stringify({ runtimes, at: new Date().toISOString() }, null, 2)}\n`);
}

function goalSatisfied(spec, lastRun, lastTest) {
  if (spec.wantsTest) return Boolean(lastTest?.ok);
  return Boolean(lastRun?.ok);
}

function finish(ok, spec, { steps, lastRun, lastTest, state, summary, stats }) {
  return {
    ok,
    steps,
    summary,
    stdout: lastTest?.stdout ?? lastRun?.stdout,
    lang: spec.ext,
    learned: state.learned,
    stats,
  };
}

export async function runDevAgent({
  workspace,
  goal,
  chat,
  maxSteps = 12,
  maxModelSteps,
  lockAlias = true,
  model = 'general-text-speculator',
  lang,
  useFallback = true,
  maxTokens = 768,
} = {}) {
  if (!workspace || !goal) throw new Error('workspace and goal required');
  await mkdir(workspace, { recursive: true });
  const spec = parseGoal(goal);
  if (lang) {
    const ext = canonicalExt(lang);
    if (ext) spec.ext = ext;
  }
  const state = { learned: {}, extra: {} };
  await loadLearn(workspace, state);
  const steps = [];
  const history = [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: String(goal) },
  ];
  const fallback = fallbackPlan(goal, spec);
  let fallbackI = 0;
  let lastRun = null;
  let lastTest = null;
  let modelWrote = false;
  let modelStop = false;
  const stats = { gatewayHits: 0, modelActions: 0, fallbackActions: 0, modelErrors: 0 };
  const modelBudget = Number.isFinite(maxModelSteps) ? maxModelSteps : maxSteps;
  for (let i = 0; i < maxSteps; i += 1) {
    let action = null;
    let fromModel = false;
    if (typeof chat === 'function' && stats.gatewayHits < modelBudget && !modelStop) {
      try {
        const text = await chat({ messages: history, model, lock_alias: lockAlias, max_tokens: maxTokens });
        stats.gatewayHits += 1;
        const parsed = parseAction(text);
        steps.push({ model: text, action: parsed });
        if (validAction(parsed)) {
          if (parsed.done && !goalSatisfied(spec, lastRun, lastTest) && !modelWrote) {
            action = null;
            modelStop = true;
          } else {
            action = parsed;
            fromModel = true;
          }
        } else {
          modelStop = true;
        }
      } catch (error) {
        stats.modelErrors += 1;
        modelStop = true;
        steps.push({ error: String(error.message ?? error) });
      }
    }
    if (!action && useFallback && fallbackI < fallback.length) {
      action = fallback[fallbackI];
      fallbackI += 1;
      fromModel = false;
      steps.push({ model: null, action, fallback: true });
    }
    if (!action) break;
    if (action.done) {
      if (!goalSatisfied(spec, lastRun, lastTest)) continue;
      await saveLearn(workspace, state);
      return finish(true, spec, {
        steps, lastRun, lastTest, state, stats,
        summary: action.summary ?? 'done',
      });
    }
    if (fromModel) stats.modelActions += 1;
    else stats.fallbackActions += 1;
    if (fromModel && action.tool === 'write') modelWrote = true;
    const result = await execTool(workspace, action, state);
    steps.push({ result });
    if (action.tool === 'run' || action.tool === 'test') {
      lastRun = result;
      if (result.test || action.tool === 'test' || isTestPath(action.path)) lastTest = result;
    }
    history.push({ role: 'assistant', content: JSON.stringify(historyAction(action)) });
    history.push({ role: 'user', content: JSON.stringify({
      ok: result.ok,
      path: result.path,
      code: result.code,
      stdout: clip(result.stdout, HISTORY_CLIP),
      stderr: clip(result.stderr, HISTORY_CLIP),
      error: result.error,
      available: result.available,
    }) });
    if (goalSatisfied(spec, lastRun, lastTest) && (action.tool === 'run' || action.tool === 'test') && result.ok) {
      await saveLearn(workspace, state);
      return finish(true, spec, {
        steps, lastRun, lastTest, state, stats,
        summary: lastTest?.ok ? 'tests passed' : 'ran successfully',
      });
    }
  }
  await saveLearn(workspace, state).catch(() => {});
  const ok = goalSatisfied(spec, lastRun, lastTest);
  return finish(ok, spec, {
    steps, lastRun, lastTest, state, stats,
    summary: ok ? (lastTest?.ok ? 'tests passed' : 'ran') : (lastRun?.stderr || 'max steps'),
  });
}

export async function gatewayChat(base, body, { timeoutMs } = {}) {
  const ms = Number(timeoutMs);
  if (!Number.isFinite(ms) || ms < 1) {
    throw new Error('gatewayChat timeoutMs is required (gateway.agent_chat_timeout_ms or --timeout-ms)');
  }
  const res = await fetch(`${String(base).replace(/\/$/, '')}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ stream: false, ...body }),
    signal: AbortSignal.timeout(ms),
  });
  const json = await res.json();
  return json?.choices?.[0]?.message?.content ?? json?.error?.message ?? '';
}
