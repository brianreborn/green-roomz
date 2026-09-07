import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  clearExtra,
  detectLang,
  execTool,
  fallbackPlan,
  jail,
  gatewayChat,
  parseAction,
  parseGoal,
  runDevAgent,
} from '../src/dev-agent.mjs';

function tmp(prefix) {
  return mkdtempSync(path.join(os.tmpdir(), prefix));
}

test('jail blocks path escape', () => {
  const root = tmp('grz-jail-');
  assert.throws(() => jail(root, '..\\..\\Windows\\System32'), /escapes/);
  rmSync(root, { recursive: true, force: true });
});

test('detectLang follows the goal, not a default JS religion', () => {
  assert.equal(detectLang('write a python script that prints hi'), '.py');
  assert.equal(detectLang('node hello'), '.mjs');
  assert.equal(detectLang('x', 'main.go'), '.go');
  assert.equal(detectLang('a rust program that prints hi'), '.rs');
  assert.equal(detectLang('powershell script'), '.ps1');
});

test('parseAction takes the first JSON object', () => {
  const a = parseAction('noise\n{"tool":"run","path":"a.mjs"}\n');
  assert.equal(a.tool, 'run');
  assert.equal(parseAction('not json'), null);
});

test('offline loop writes and runs hello.mjs', async () => {
  const workspace = tmp('grz-agent-');
  try {
    const result = await runDevAgent({
      workspace,
      goal: 'create a file that prints hello-grz and run it',
    });
    assert.equal(result.ok, true, result.summary);
    const out = String(result.stdout || '');
    assert.match(out, /hello-grz/);
    const text = readFileSync(path.join(workspace, 'hello.mjs'), 'utf8');
    assert.match(text, /hello-grz/);
    assert.equal(result.lang, '.mjs');
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('python goal uses .py when python is available', async () => {
  const workspace = tmp('grz-py-');
  try {
    const plan = fallbackPlan('write python that prints hello-grz');
    assert.equal(plan[0].path, 'hello.py');
    const w = await execTool(workspace, plan[0]);
    assert.equal(w.ok, true);
    const r = await execTool(workspace, plan[1]);
    if (r.code === 127) return;
    assert.equal(r.ok, true, r.stderr);
    assert.match(String(r.stdout), /hello-grz/);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('parseGoal picks TDD shape for add+test', () => {
  const spec = parseGoal('write a python function add(a,b) with a test that checks 2+3=5 and run the test');
  assert.equal(spec.ext, '.py');
  assert.equal(spec.fn, 'add');
  assert.equal(spec.wantsTest, true);
  assert.equal(spec.shape, 'fn-test');
});

test('offline python add+test is end-to-end', async () => {
  const workspace = tmp('grz-add-');
  try {
    const result = await runDevAgent({
      workspace,
      goal: 'write a python function add(a,b) with a test that checks 2+3=5 and run the test',
    });
    if (/no runtime for \.py/.test(String(result.summary))) return;
    assert.equal(result.ok, true, result.summary);
    assert.match(String(result.stdout), /ok/);
    assert.match(readFileSync(path.join(workspace, 'add.py'), 'utf8'), /def add/);
    assert.match(readFileSync(path.join(workspace, 'test_add.py'), 'utf8'), /assert add\(2, 3\) == 5/);
    assert.equal(result.lang, '.py');
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('successful run of a lib does not skip the test', async () => {
  const workspace = tmp('grz-notestskip-');
  try {
    const result = await runDevAgent({
      workspace,
      goal: 'write a node function add(a,b) with a test',
    });
    assert.equal(result.ok, true, result.summary);
    assert.match(String(result.stdout), /ok/);
    assert.ok(readFileSync(path.join(workspace, 'add.test.mjs'), 'utf8'));
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('chat-driven loop writes an arbitrary file then runs it', async () => {
  const workspace = tmp('grz-chat-');
  try {
    const replies = [
      JSON.stringify({ tool: 'write', path: 'app.mjs', content: 'console.log("e2e-ok");\n' }),
      JSON.stringify({ tool: 'run', path: 'app.mjs' }),
    ];
    let i = 0;
    const result = await runDevAgent({
      workspace,
      goal: 'write app.mjs that prints e2e-ok and run it',
      chat: async () => replies[i++] ?? '{"done":true,"summary":"x"}',
    });
    assert.equal(result.ok, true, result.summary);
    assert.match(String(result.stdout), /e2e-ok/);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('compiler errors drive a second write', async () => {
  const workspace = tmp('grz-fix-');
  try {
    const replies = [
      JSON.stringify({ tool: 'write', path: 'app.mjs', content: 'console.log(nope\n' }),
      JSON.stringify({ tool: 'run', path: 'app.mjs' }),
      JSON.stringify({ tool: 'write', path: 'app.mjs', content: 'console.log("fixed");\n' }),
      JSON.stringify({ tool: 'run', path: 'app.mjs' }),
    ];
    let i = 0;
    const result = await runDevAgent({
      workspace,
      goal: 'write app.mjs that prints fixed and run it',
      maxSteps: 12,
      chat: async () => replies[i++] ?? '{"done":true,"summary":"x"}',
    });
    assert.equal(result.ok, true, result.summary);
    assert.match(String(result.stdout), /fixed/);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('done after a failed run is not success', async () => {
  const workspace = tmp('grz-doneno-');
  try {
    const result = await runDevAgent({
      workspace,
      goal: 'write app.mjs that prints nope and run it',
      maxSteps: 4,
      useFallback: false,
      chat: async () => '{"done":true,"summary":"pretend"}',
    });
    assert.equal(result.ok, false);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('premature model done still finishes via fallback', async () => {
  const workspace = tmp('grz-donefb-');
  try {
    const result = await runDevAgent({
      workspace,
      goal: 'create a file that prints hello-grz and run it',
      maxSteps: 8,
      chat: async () => '{"done":true,"summary":"pretend"}',
    });
    assert.equal(result.ok, true, result.summary);
    assert.match(String(result.stdout), /hello-grz/);
    assert.ok(result.stats.fallbackActions >= 1);
    assert.equal(result.stats.gatewayHits, 1);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('invalid model reply is one gateway hit then fallback', async () => {
  const workspace = tmp('grz-invalid-');
  try {
    let calls = 0;
    const result = await runDevAgent({
      workspace,
      goal: 'create a file that prints hello-grz and run it',
      maxSteps: 8,
      maxTokens: 96,
      chat: async () => {
        calls += 1;
        return 'sure, I will write a file for you without JSON';
      },
    });
    assert.equal(result.ok, true, result.summary);
    assert.match(String(result.stdout), /hello-grz/);
    assert.equal(calls, 1);
    assert.equal(result.stats.gatewayHits, 1);
    assert.ok(result.stats.fallbackActions >= 1);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('python reverse + test', async () => {
  const workspace = tmp('grz-rev-');
  try {
    const result = await runDevAgent({
      workspace,
      goal: 'write a python reverse function with a test',
    });
    if (/no runtime for \.py/.test(String(result.summary))) return;
    assert.equal(result.ok, true, result.summary);
    assert.match(String(result.stdout), /ok/);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('python CLI add from argv', async () => {
  const workspace = tmp('grz-cli-');
  try {
    const result = await runDevAgent({
      workspace,
      goal: 'write a python cli that add two numbers from argv and run it',
    });
    if (/no runtime for \.py/.test(String(result.summary))) return;
    assert.equal(result.ok, true, result.summary);
    assert.match(String(result.stdout).trim(), /^5$/);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('python jsonpick + test', async () => {
  const workspace = tmp('grz-json-');
  try {
    const result = await runDevAgent({
      workspace,
      goal: 'write python jsonpick that parses a json key with a test',
    });
    if (/no runtime for \.py/.test(String(result.summary))) return;
    assert.equal(result.ok, true, result.summary);
    assert.match(String(result.stdout), /ok/);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('runtime tool learns a new extension as we go', async () => {
  const workspace = tmp('grz-learn-');
  try {
    const registered = await execTool(workspace, { tool: 'runtime', ext: '.hello', bin: process.execPath, args: [] });
    assert.equal(registered.ok, true, registered.error);
    const w = await execTool(workspace, { tool: 'write', path: 'hi.hello', content: 'console.log("learned");\n' });
    assert.equal(w.ok, true);
    const r = await execTool(workspace, { tool: 'run', path: 'hi.hello' });
    assert.equal(r.ok, true, r.stderr);
    assert.match(String(r.stdout), /learned/);
  } finally {
    clearExtra();
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('runtime tool rejects a path-shaped bin', async () => {
  const workspace = tmp('grz-bin-');
  try {
    const r = await execTool(workspace, { tool: 'runtime', ext: '.x', bin: 'C:\\Windows\\System32\\cmd.exe', args: [] });
    assert.equal(r.ok, false);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('missing go runtime is 127, not a throw', async () => {
  const workspace = tmp('grz-go-');
  try {
    const plan = fallbackPlan('go program that prints hello-grz');
    assert.equal(plan[0].path, 'hello.go');
    await execTool(workspace, plan[0]);
    const r = await execTool(workspace, plan[1]);
    if (r.code === 0) return;
    assert.equal(r.code, 127);
    assert.match(String(r.stderr), /no runtime for \.go|not recognized|ENOENT|not installed/i);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('probe lists node', async () => {
  const workspace = tmp('grz-probe-');
  try {
    const r = await execTool(workspace, { tool: 'probe' });
    assert.equal(r.ok, true);
    assert.ok(r.available.some((row) => row.ext === '.mjs'));
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('gatewayChat refuses a missing timeout', async () => {
  await assert.rejects(
    () => gatewayChat('http://127.0.0.1:8080', { messages: [] }),
    /timeoutMs is required/,
  );
});

test('probe without ext does not spawn every language', async () => {
  const workspace = tmp('grz-probe-lazy-');
  try {
    const t0 = Date.now();
    const r = await execTool(workspace, { tool: 'probe' });
    const ms = Date.now() - t0;
    assert.equal(r.ok, true);
    assert.ok(r.available.some((row) => row.ext === '.mjs'));
    assert.equal(r.available.some((row) => row.ext === '.ps1'), false);
    assert.equal(r.available.some((row) => row.ext === '.go'), false);
    assert.ok(ms < 3000, `lazy probe took ${ms}ms`);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});
