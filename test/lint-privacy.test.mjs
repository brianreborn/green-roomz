// Runs scripts/lint_privacy.py (issue #28) as part of `npm test` so a LAN
// address, host name, user name or home path in a public file fails the suite.
// Skips only when no Python 3 interpreter is on PATH.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const script = path.join(root, 'scripts', 'lint_privacy.py');

function findPython() {
  for (const cmd of ['python3', 'python']) {
    const r = spawnSync(cmd, ['-c', 'import sys; sys.exit(0 if sys.version_info[0] == 3 else 1)'], { encoding: 'utf8' });
    if (r.status === 0) return cmd;
  }
  return null;
}

const py = findPython();

test('public tree passes the privacy lint', { skip: py ? false : 'python 3 not on PATH' }, () => {
  const r = spawnSync(py, ['-B', script, '--root', root], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  assert.equal(r.error, undefined, String(r.error));
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
});
