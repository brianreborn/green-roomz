import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QUANT_MS, ceilQuantum, holdMs } from '../src/timing-quant.mjs';

test('ceilQuantum is a multiple of 50', () => {
  assert.equal(QUANT_MS, 50);
  for (const elapsed of [0, 1, 49, 50, 51, 99, 100, 1234]) {
    const q = ceilQuantum(elapsed);
    assert.equal(q % 50, 0, elapsed);
    assert.ok(q >= elapsed);
  }
});

test('holdMs is never negative', () => {
  const now = 10_000;
  assert.ok(holdMs(now, now) >= 0);
  assert.ok(holdMs(now - 1, now) >= 0);
  assert.ok(holdMs(now - 50, now) >= 0);
  assert.ok(holdMs(now + 5, now) >= 0);
  assert.equal(holdMs(now - 10, now) + 10, 50);
});
