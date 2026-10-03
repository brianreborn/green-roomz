import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PolicyGate } from '../src/scheduler.mjs';

test('maximize does not serialize unrelated work', async () => {
  const gate = new PolicyGate('maximize');
  const first = await gate.acquire();
  const second = await gate.acquire();
  assert.equal(gate.active, 2);
  first();
  second();
  assert.equal(gate.active, 0);
});

test('responsive queues a second heavy request', async () => {
  const gate = new PolicyGate('responsive');
  const first = await gate.acquire();
  let released = false;
  const pending = gate.acquire().then((release) => { released = true; release(); });
  assert.equal(released, false);
  first();
  await pending;
  assert.equal(released, true);
});
