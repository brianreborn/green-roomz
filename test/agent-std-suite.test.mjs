import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

test('agent-std suite is a frozen verifiable set', async () => {
  const p = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'eval', 'agent-std.json');
  const suite = JSON.parse(await readFile(p, 'utf8'));
  assert.equal(suite.schema, 'green-roomz.agent-std.v1');
  assert.ok(suite.cases.length >= 8);
  const ids = new Set();
  for (const c of suite.cases) {
    assert.ok(c.id && c.family && c.gate && c.expect);
    assert.equal(ids.has(c.id), false, c.id);
    ids.add(c.id);
    assert.ok(c.gate === 'protocol' || c.gate === 'quality');
  }
  assert.ok(suite.cases.some((c) => c.expect.status === 503));
});
