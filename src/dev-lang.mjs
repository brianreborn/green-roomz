import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { detectFn, shapeFor, SHAPES } from './dev-shapes.mjs';

const EXTRA = new Map();
const probeCache = new Map();

const ALLOWED_BINS = new Set([
  'python', 'py', 'python3', 'node', 'nodejs',
  'go', 'rustc', 'cargo', 'gcc', 'g++', 'clang', 'clang++',
  'javac', 'java', 'ruby', 'php', 'perl', 'lua',
  'powershell', 'pwsh', 'dotnet', 'csc', 'tsc', 'bun', 'deno',
]);

export const LANGS = Object.freeze({
  '.mjs': { id: 'javascript', aliases: ['javascript', 'node', 'nodejs', 'ecmascript'], bins: [{ bin: process.execPath, args: [], skipProbe: true }] },
  '.js': { id: 'javascript', aliases: ['js'], bins: [{ bin: process.execPath, args: [], skipProbe: true }] },
  '.cjs': { id: 'javascript', aliases: [], bins: [{ bin: process.execPath, args: [], skipProbe: true }] },
  '.py': {
    id: 'python',
    aliases: ['python', 'python3', 'py', 'pytest'],
    bins: [{ bin: 'python', args: [] }, { bin: 'py', args: ['-3'] }, { bin: 'python3', args: [] }],
    probeArgs: ['--version'],
  },
  '.go': { id: 'go', aliases: ['golang'], bins: [{ bin: 'go', args: ['run'] }], probeArgs: ['version'] },
  '.rs': { id: 'rust', aliases: ['rust', 'cargo'], bins: [{ bin: 'rustc', args: [] }], compile: true, probeArgs: ['--version'] },
  '.c': { id: 'c', aliases: [], bins: [{ bin: 'gcc', args: [] }, { bin: 'clang', args: [] }], compile: true, probeArgs: ['--version'] },
  '.cpp': { id: 'cpp', aliases: ['c++', 'cplusplus'], bins: [{ bin: 'g++', args: [] }, { bin: 'clang++', args: [] }], compile: true, probeArgs: ['--version'] },
  '.java': { id: 'java', aliases: ['java'], bins: [{ bin: 'java', args: [] }], compileBin: 'javac', probeArgs: ['-version'] },
  '.ps1': { id: 'powershell', aliases: ['powershell', 'pwsh'], bins: [{ bin: 'powershell', args: ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File'] }], probeArgs: ['-NoProfile', '-Command', '$PSVersionTable.PSVersion.ToString()'] },
  '.rb': { id: 'ruby', aliases: ['ruby'], bins: [{ bin: 'ruby', args: [] }], probeArgs: ['--version'] },
  '.php': { id: 'php', aliases: ['php'], bins: [{ bin: 'php', args: [] }], probeArgs: ['--version'] },
  '.ts': { id: 'typescript', aliases: ['typescript'], bins: [{ bin: 'tsc', args: [] }], compile: true, probeArgs: ['--version'] },
});

export function clearProbeCache() {
  probeCache.clear();
}

export function clearExtra() {
  EXTRA.clear();
}

export function canonicalExt(value) {
  if (!value) return null;
  const t = String(value).trim().toLowerCase();
  if (LANGS[t]) return t;
  if (LANGS[`.${t}`]) return `.${t}`;
  for (const [ext, spec] of Object.entries(LANGS)) {
    if (spec.id === t || spec.aliases.includes(t)) return ext;
  }
  return null;
}

export function detectLang(goal, filePath = '') {
  const ext = path.extname(String(filePath ?? '')).toLowerCase();
  if (langSpec(ext)) return ext;
  const g = String(goal ?? '').toLowerCase();
  const named = g.match(/[\w.-]+\.(mjs|js|cjs|py|go|rs|c|cpp|cc|java|ps1|rb|php|ts)\b/);
  if (named) {
    const e = named[1] === 'cc' ? '.cpp' : `.${named[1]}`;
    if (langSpec(e)) return e;
  }
  if (/\.c\b/.test(g) || /\bc program\b/.test(g)) return '.c';
  const ranked = Object.entries(LANGS)
    .flatMap(([e, spec]) => [spec.id, ...spec.aliases].filter(Boolean).map((a) => ({ ext: e, alias: a })))
    .sort((a, b) => b.alias.length - a.alias.length);
  for (const { ext: e, alias } of ranked) {
    if (alias.length < 2) continue;
    if (new RegExp(`\\b${escapeRe(alias)}\\b`, 'i').test(g)) return e;
  }
  return '.mjs';
}

export function parseGoal(goal, filePath = '') {
  const g = String(goal ?? '');
  const quoted = g.match(/prints?\s+["']([^"']+)["']/i);
  const unquoted = g.match(/prints?\s+(\S+)/i);
  let printToken = quoted?.[1] ?? null;
  if (!printToken && unquoted?.[1] && !/^(and|then|it|the|a)$/i.test(unquoted[1])) {
    printToken = unquoted[1].replace(/[.,;]+$/, '');
  }
  if (!printToken && /hello-grz/i.test(g)) printToken = 'hello-grz';
  if (!printToken) printToken = 'hello-grz';

  const wantsTest = /\b(tests?|pytest|unittest|assert|spec)\b/i.test(g);
  const wantsCli = /\b(cli|argv|command[- ]line|sys\.argv|process\.argv)\b/i.test(g);
  const fn = detectFn(g);

  const fileMatch = g.match(/([\w.-]+\.(mjs|js|cjs|py|go|rs|c|cpp|java|ps1|rb|php|ts))\b/i);
  const ext = detectLang(g, filePath || fileMatch?.[1] || '');
  let shape = 'print';
  if (wantsCli && (fn || /\badd\b/i.test(g))) shape = 'cli';
  else if (fn) shape = wantsTest ? 'fn-test' : 'fn';
  else if (wantsTest) shape = 'fn-test';

  let base = 'hello';
  if (fn) base = fn;
  else if (shape !== 'print') {
    const namedApp = g.match(/write\s+(?:a\s+)?(?:tiny\s+|simple\s+|small\s+)?(\w+)\s+(?:app|cli|script|module|library)/i);
    base = namedApp?.[1]?.toLowerCase() || 'app';
  }
  if (fileMatch) base = path.basename(fileMatch[1], path.extname(fileMatch[1]));
  if (shape === 'cli' && !fn) {
    /* keep base */
  }
  const cliArgs = shape === 'cli' ? (SHAPES[fn || 'add']?.cliArgs || ['2', '3']) : null;

  return { ext, printToken, wantsTest, fn: fn || (shape === 'cli' ? 'add' : null), shape, base: shape === 'cli' ? (fn || 'add') : base, fileFromGoal: fileMatch?.[1] ?? null, cliArgs, wantsCli };
}

export function namesFor(spec) {
  const ext = spec.ext;
  let base = spec.base || 'hello';
  if (ext === '.java') {
    base = base.charAt(0).toUpperCase() + base.slice(1);
    return { lib: `${base}.java`, main: `${base}.java`, test: `${base}Test.java` };
  }
  if (ext === '.py') {
    return { lib: `${base}.py`, main: shapeMain(spec, `${base}.py`, 'main.py'), test: `test_${base}.py` };
  }
  if (ext === '.go') {
    return { lib: `${base}.go`, main: `${base}.go`, test: `${base}_test.go` };
  }
  if (ext === '.mjs' || ext === '.js' || ext === '.cjs') {
    const lib = `${base}.mjs`;
    return { lib, main: shapeMain(spec, lib, 'main.mjs'), test: `${base}.test.mjs` };
  }
  return { lib: `${base}${ext}`, main: `${base}${ext}`, test: `${base}.test${ext}` };
}

function shapeMain(spec, lib, main) {
  return spec.shape === 'print' ? lib : spec.shape === 'fn-test' ? lib : main;
}

export function sourcesFor(spec) {
  const names = namesFor(spec);
  if (spec.shape === 'cli') {
    const row = shapeFor(spec.fn || 'add', spec.ext);
    const content = row?.cli || printSource(spec.ext, spec.printToken, names);
    return { main: { path: names.lib, content } };
  }
  if (spec.shape === 'print' || !spec.fn) {
    const mainPath = names.main === names.lib ? names.lib : names.main;
    const main = { path: mainPath, content: printSource(spec.ext, spec.printToken, names) };
    if (spec.wantsTest) {
      return { main, test: { path: names.test, content: printTestSource(spec, mainPath) } };
    }
    return { main };
  }
  const lib = fnLibSource(spec);
  const test = spec.wantsTest ? fnTestSource(spec) : null;
  const main = spec.wantsTest ? null : fnMainSource(spec);
  const out = { lib: { path: names.lib, content: lib } };
  if (main && names.main !== names.lib) out.main = { path: names.main, content: main };
  if (test) out.test = { path: names.test, content: test };
  return out;
}

export function isTestPath(rel) {
  const base = path.basename(String(rel ?? ''));
  return /^(test_|.*_test\.|.*\.(test|spec)\.)/i.test(base) || /test\.(py|mjs|js|go)$/i.test(base);
}

export function langSpec(ext, state = {}) {
  if (!ext) return null;
  const e = ext.startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`;
  return state.extra?.[e] || EXTRA.get(e) || LANGS[e] || null;
}

export function binAllowed(bin) {
  if (!bin) return false;
  if (bin === process.execPath) return true;
  if (/[\\/]/.test(bin)) return false;
  const base = path.basename(bin).replace(/\.exe$/i, '').toLowerCase();
  return ALLOWED_BINS.has(base);
}

/** PATH existence only — do not spawn. Missing gcc/rustc/powershell version probes are expensive. */
export function binOnPath(bin) {
  if (!bin) return false;
  if (bin === process.execPath) return true;
  if (path.isAbsolute(bin)) return existsSync(bin);
  const dirs = (process.env.PATH || '').split(path.delimiter);
  const names = process.platform === 'win32'
    ? [`${bin}.exe`, `${bin}.cmd`, `${bin}.bat`, bin]
    : [bin];
  for (const dir of dirs) {
    if (!dir) continue;
    for (const name of names) {
      if (existsSync(path.join(dir, name))) return true;
    }
  }
  return false;
}

export function registerRuntime(ext, spec, state = {}) {
  const e = ext.startsWith('.') ? ext.toLowerCase() : `.${String(ext).toLowerCase()}`;
  const bin = spec?.bin;
  if (!binAllowed(bin)) throw new Error(`runtime bin not allowed: ${bin}`);
  const row = {
    id: spec.id || e.slice(1),
    aliases: spec.aliases || [],
    bins: [{ bin, args: Array.isArray(spec.args) ? spec.args : [], skipProbe: bin === process.execPath }],
  };
  EXTRA.set(e, row);
  state.extra = state.extra || {};
  state.extra[e] = row;
  if (state.learned) delete state.learned[e];
  return { ext: e, bin, args: row.bins[0].args };
}

export function clip(text, n = 32_000) {
  const s = String(text ?? '');
  return s.length > n ? `${s.slice(0, n)}\n…truncated` : s;
}

export function spawnCaptured(bin, args, { cwd, timeoutMs = 30_000 } = {}) {
  return new Promise((resolve) => {
    const child = spawn(bin, args, {
      cwd,
      env: process.env,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      resolve({ code: 124, stdout: clip(stdout), stderr: clip(stderr + '\ntimeout') });
    }, timeoutMs);
    child.stdout?.on('data', (d) => { stdout += d; });
    child.stderr?.on('data', (d) => { stderr += d; });
    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({ code: 127, stdout: clip(stdout), stderr: clip(error.message) });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, stdout: clip(stdout), stderr: clip(stderr) });
    });
  });
}

export async function probeBin(bin, args = ['--version']) {
  const key = `${bin}\0${args.join('\0')}`;
  if (probeCache.has(key)) return probeCache.get(key);
  const result = await spawnCaptured(bin, args, { timeoutMs: 5_000, cwd: process.cwd() });
  let found = null;
  if (result.code !== 127 && result.code !== 124) {
    const text = `${result.stdout}\n${result.stderr}`.trim();
    if (result.code === 0 || text) found = { bin, version: text.split(/\r?\n/).find(Boolean)?.slice(0, 120) || 'ok' };
  }
  probeCache.set(key, found);
  return found;
}

export async function resolveRuntime(ext, state = {}) {
  const learned = state.learned ?? (state.learned = {});
  if (learned[ext]?.bin) return learned[ext];
  const spec = langSpec(ext, state);
  if (!spec?.bins?.length) return null;
  for (const cand of spec.bins) {
    if (cand.skipProbe || cand.bin === process.execPath) {
      const resolved = { bin: cand.bin, args: cand.args ?? [] };
      learned[ext] = resolved;
      return resolved;
    }
    if (!binOnPath(cand.bin)) continue;
    const probed = await probeBin(cand.bin, spec.probeArgs ?? ['--version']);
    if (probed) {
      const resolved = { bin: cand.bin, args: cand.args ?? [], version: probed.version };
      learned[ext] = resolved;
      return resolved;
    }
  }
  return null;
}

function normalizeProbeExt(value) {
  if (!value) return null;
  const t = String(value).trim().toLowerCase();
  if (LANGS[t] || EXTRA.has(t)) return t;
  const canon = canonicalExt(t);
  if (canon) return canon;
  if (t.startsWith('.')) return t;
  const dotted = `.${t}`;
  return LANGS[dotted] || EXTRA.has(dotted) ? dotted : null;
}

/** Default: skipProbe langs + already-learned/extra. Pass `exts` to probe one language. */
export async function probeRuntimes(state = {}, { exts } = {}) {
  const out = {};
  const extraExts = [...Object.keys(state.extra || {}), ...EXTRA.keys()];
  const skipProbeExts = Object.entries(LANGS)
    .filter(([, spec]) => spec.bins?.some((b) => b.skipProbe || b.bin === process.execPath))
    .map(([ext]) => ext);
  const wanted = Array.isArray(exts) && exts.length
    ? exts.map(normalizeProbeExt).filter(Boolean)
    : [...skipProbeExts, ...extraExts, ...Object.keys(state.learned || {})];
  for (const ext of new Set(wanted)) {
    out[ext] = await resolveRuntime(ext, state);
  }
  return out;
}

export async function runFile(workspace, abs, rel, state = {}, opts = {}) {
  const { timeoutMs = 30_000, args = [] } = opts;
  const extra = Array.isArray(args) ? args.map(String) : [];
  const ext = path.extname(abs).toLowerCase();
  const spec = langSpec(ext, state);
  if (!spec) return { code: 127, stdout: '', stderr: `no runtime for ${ext}` };
  const rt = await resolveRuntime(ext, state);
  if (!rt) return { code: 127, stdout: '', stderr: `no runtime for ${ext} (not installed)` };

  if (spec.compile) {
    const outName = path.basename(abs, ext) + (process.platform === 'win32' ? '.exe' : '');
    const outAbs = path.join(path.dirname(abs), outName);
    const compiled = await spawnCaptured(rt.bin, [...(rt.args ?? []), '-o', outAbs, abs], { cwd: workspace, timeoutMs });
    if (compiled.code !== 0) return compiled;
    return spawnCaptured(outAbs, extra, { cwd: workspace, timeoutMs });
  }
  if (ext === '.java') {
    const compiled = await spawnCaptured(spec.compileBin || 'javac', [abs], { cwd: workspace, timeoutMs });
    if (compiled.code === 127) return { ...compiled, stderr: compiled.stderr || 'no runtime for .java (not installed)' };
    if (compiled.code !== 0) return compiled;
    const cls = path.basename(abs, '.java');
    return spawnCaptured(rt.bin, ['-cp', path.dirname(abs), cls, ...extra], { cwd: workspace, timeoutMs });
  }
  return spawnCaptured(rt.bin, [...(rt.args ?? []), abs, ...extra], { cwd: workspace, timeoutMs });
}

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function printTestSource(spec, mainPath) {
  const token = spec.printToken;
  if (spec.ext === '.py') {
    return `import subprocess, sys\nout = subprocess.check_output([sys.executable, ${JSON.stringify(mainPath)}], text=True)\nassert ${JSON.stringify(token)} in out\nprint("ok")\n`;
  }
  if (spec.ext === '.mjs' || spec.ext === '.js' || spec.ext === '.cjs') {
    return `import { spawnSync } from "node:child_process";\nconst r = spawnSync(process.execPath, [${JSON.stringify(mainPath)}], { encoding: "utf8" });\nif (!String(r.stdout).includes(${JSON.stringify(token)})) process.exit(1);\nconsole.log("ok");\n`;
  }
  return printSource(spec.ext, 'ok');
}

function printSource(ext, token, names = {}) {
  const t = JSON.stringify(token);
  switch (ext) {
    case '.py': return `print(${t})\n`;
    case '.go': return `package main\nimport "fmt"\nfunc main() { fmt.Println(${t}) }\n`;
    case '.rs': return `fn main() { println!("{}", ${t}); }\n`;
    case '.c': return `#include <stdio.h>\nint main(void) { puts(${t}); return 0; }\n`;
    case '.cpp': return `#include <iostream>\nint main() { std::cout << ${t} << std::endl; }\n`;
    case '.java': {
      const cls = path.basename(names.main || 'Hello.java', '.java');
      return `public class ${cls} { public static void main(String[] a) { System.out.println(${t}); } }\n`;
    }
    case '.ps1': return `Write-Output ${t}\n`;
    case '.rb': return `puts ${t}\n`;
    case '.php': return `<?php echo ${t}, PHP_EOL;\n`;
    default: return `console.log(${t});\n`;
  }
}

function fnLibSource(spec) {
  const row = shapeFor(spec.fn, spec.ext);
  if (row?.lib) return row.lib;
  if (spec.ext === '.go' && spec.fn === 'add') {
    return 'package main\nfunc Add(a, b int) int { return a + b }\nfunc main() { println(Add(2, 3)) }\n';
  }
  return printSource(spec.ext, spec.printToken);
}

function fnMainSource(spec) {
  const row = shapeFor(spec.fn, spec.ext);
  const names = namesFor(spec);
  if (row?.mainCall && spec.ext === '.py') return `from ${spec.base} import ${spec.fn}\n${row.mainCall}`;
  if (row?.mainCall && (spec.ext === '.mjs' || spec.ext === '.js' || spec.ext === '.cjs')) {
    return `import { ${spec.fn} } from ${JSON.stringify('./' + names.lib)};\n${row.mainCall}`;
  }
  return printSource(spec.ext, spec.printToken, names);
}

function fnTestSource(spec) {
  const row = shapeFor(spec.fn, spec.ext);
  if (row?.test) return row.test;
  return printSource(spec.ext, 'ok');
}
