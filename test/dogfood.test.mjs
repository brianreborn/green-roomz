import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DOGFOOD_SYSTEM, FALLBACK_MODEL, PREFERRED_MODEL, resolveModel, reviewDiff, runDogfood } from '../src/dogfood.mjs';

function tmp(prefix) {
  return mkdtempSync(path.join(os.tmpdir(), prefix));
}

function fenced(body) {
  return `\`\`\`diff\n${body.trim()}\n\`\`\``;
}

const ONE_FILE = fenced(`diff --git a/src/note.txt b/src/note.txt
--- a/src/note.txt
+++ b/src/note.txt
@@ -1 +1 @@
-old
+new`);

function fakeFetch(content, capture) {
  return async (url, init) => {
    capture?.push({ url, body: JSON.parse(init.body) });
    return { ok: true, json: async () => ({ choices: [{ message: { content } }] }) };
  };
}

function noteRepo() {
  const root = tmp('grz-dogfood-');
  mkdirSync(path.join(root, 'src'), { recursive: true });
  const file = path.join(root, 'src', 'note.txt');
  writeFileSync(file, 'old\n');
  return { root, file };
}

test('garbage model output is not applied', async () => {
  const { root, file } = noteRepo();
  let tested = false;
  try {
    const result = await runDogfood({
      repoRoot: root,
      goal: 'change the note',
      apply: true,
      fetchImpl: fakeFetch('not a diff, just chatter'),
      runTests: () => { tested = true; return 0; },
    });
    assert.equal(result.ok, false);
    assert.equal(result.applied, false);
    assert.equal(tested, false);
    assert.equal(readFileSync(file, 'utf8'), 'old\n');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a diff that names runtime/foo is rejected', async () => {
  const root = tmp('grz-dogfood-rt-');
  const file = path.join(root, 'runtime', 'foo');
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, 'keep\n');
  const diff = fenced(`diff --git a/runtime/foo b/runtime/foo
--- a/runtime/foo
+++ b/runtime/foo
@@ -1 +1 @@
-keep
+nope`);
  let tested = false;
  try {
    const result = await runDogfood({
      repoRoot: root,
      goal: 'edit runtime',
      apply: true,
      fetchImpl: fakeFetch(diff),
      runTests: () => { tested = true; return 0; },
    });
    assert.equal(result.ok, false);
    assert.equal(result.applied, false);
    assert.match(result.reason, /runtime/);
    assert.equal(tested, false);
    assert.equal(readFileSync(file, 'utf8'), 'keep\n');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a valid one-file diff is applied when apply=true and tests return 0', async () => {
  const { root, file } = noteRepo();
  const seen = [];
  let testedFiles = null;
  try {
    const result = await runDogfood({
      repoRoot: root,
      goal: 'replace old with new',
      apply: true,
      fetchImpl: fakeFetch(ONE_FILE, seen),
      runTests: (files) => {
        testedFiles = files;
        assert.equal(readFileSync(file, 'utf8'), 'new\n');
        return 0;
      },
    });
    assert.equal(result.ok, true);
    assert.equal(result.applied, true);
    assert.equal(readFileSync(file, 'utf8'), 'new\n');
    assert.ok(testedFiles.includes('test/dogfood.test.mjs'));
    assert.equal(seen[0].body.lock_alias, true);
    assert.equal(seen[0].body.dogfood, true);
    assert.equal(seen[0].body.stream, true);
    assert.equal(seen[0].body.model, resolveModel());
    assert.equal(seen[0].url.endsWith('/v1/chat/completions'), true);
    assert.match(seen[0].body.messages[0].content, /```diff/);
    assert.match(seen[0].body.messages[1].content, /replace old with new/);
    assert.match(DOGFOOD_SYSTEM, /```diff/);
    assert.equal(PREFERRED_MODEL, 'qwenstral-code-speculator');
    assert.equal(FALLBACK_MODEL, 'general-text-speculator');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a glued unfenced diff is kept and will not recreate an existing file', async () => {
  const glued = 'diff --git a/scripts/note.sh b/scripts/note.sh new file mode 100644 index 0000000..4b36e85 --- /dev/null +++ b/scripts/note.sh @@ -0,0 +1,2 @@\n# Run this from Termux, not from adb shell.\n';
  const reviewed = reviewDiff(glued);
  assert.equal(reviewed.ok, true, reviewed.reason);
  assert.equal(reviewed.files[0].rel, 'scripts/note.sh');
  assert.equal(reviewed.files[0].created, true);
  const root = tmp('grz-dogfood-re-');
  mkdirSync(path.join(root, 'scripts'), { recursive: true });
  const file = path.join(root, 'scripts', 'note.sh');
  writeFileSync(file, '#!/bin/sh\necho hi\n');
  try {
    const result = await runDogfood({
      repoRoot: root,
      goal: 'comment',
      apply: true,
      fetchImpl: fakeFetch(glued),
      runTests: () => 0,
    });
    assert.equal(result.ok, false);
    assert.match(result.reason, /recreate existing/);
    assert.equal(readFileSync(file, 'utf8'), '#!/bin/sh\necho hi\n');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the same diff is reverted when the test runner returns non-zero', async () => {
  const { root, file } = noteRepo();
  let sawApplied = false;
  try {
    const result = await runDogfood({
      repoRoot: root,
      goal: 'replace old with new',
      apply: true,
      fetchImpl: fakeFetch(ONE_FILE),
      runTests: () => {
        sawApplied = readFileSync(file, 'utf8') === 'new\n';
        return { status: 2 };
      },
    });
    assert.equal(sawApplied, true);
    assert.equal(result.ok, false);
    assert.equal(result.applied, false);
    assert.equal(result.reverted, true);
    assert.equal(readFileSync(file, 'utf8'), 'old\n');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
