import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  REMAINDER_MS,
  TOKEN_MS,
  TIMING_PRIVACY_MODES,
  ceilQuantum,
  holdMs,
  resolveTimingPrivacy,
  bucketDelay,
} from '../src/timing-quant.mjs';

test('off is zero hold; missing mode does not resolve', () => {
  assert.deepEqual(TIMING_PRIVACY_MODES, ['off', 'next_acquire', 'response']);
  assert.equal(resolveTimingPrivacy({}), null);
  assert.equal(resolveTimingPrivacy({ timing_privacy: 'off' }).q, 0);
  assert.equal(holdMs(0, 1000, 0), 0);
});

test('remainder is one bucket only: [0, q), never pad plus another U[0,q)', () => {
  const q = REMAINDER_MS;
  const t = 10_000;
  assert.equal(holdMs(t, t + 1, q), q - 1);
  assert.equal(holdMs(t, t + q, q), 0);
  assert.equal(holdMs(t, t, q), 0);
  assert.ok(holdMs(t, t + 1, q) < q);
  assert.equal(TOKEN_MS, 330);
});

test('dither stays inside the same bucket, not a second quantum', () => {
  const q = 50;
  const t = 20_000;
  const pad = holdMs(t, t + 10, q, () => 0, { dither: false });
  const low = holdMs(t, t + 10, q, () => 0, { dither: true });
  const high = holdMs(t, t + 10, q, () => 0.999, { dither: true });
  assert.equal(low, pad);
  assert.ok(high < q);
  assert.ok(high >= pad);
  assert.ok(high - pad < q);
});

test('ceilQuantum does not turn empty elapsed into a full quantum', () => {
  assert.equal(ceilQuantum(0, 50), 0);
  assert.equal(ceilQuantum(1, 50), 50);
  assert.equal(ceilQuantum(50, 50), 50);
  assert.equal(bucketDelay(0, 50), 0);
});

test('resolveTimingPrivacy next_acquire vs response', () => {
  const n = resolveTimingPrivacy({ timing_privacy: 'next_acquire' });
  assert.equal(n.q, 50);
  assert.equal(n.holdBeforeResponse, false);
  assert.equal(n.dither, false);
  const r = resolveTimingPrivacy({ timing_privacy: 'response' });
  assert.equal(r.holdBeforeResponse, true);
  assert.equal(r.q, 50);
  const custom = resolveTimingPrivacy({ timing_privacy: 'next_acquire', timing_privacy_quantum_ms: 16 });
  assert.equal(custom.q, 16);
});
