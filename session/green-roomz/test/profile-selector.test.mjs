import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectProfile, scoreProfile } from '../src/profile-selector.mjs';
import { parseLlamaBench } from '../src/benchmark.mjs';

test('invalid metrics cannot beat a valid profile', () => {
  const { winner, ranked } = selectProfile([
    { profile: { id: 'fast-invalid' }, metrics: { promptTps: Number.NaN, generationTps: 999 } },
    { profile: { id: 'cpu-4' }, metrics: { promptTps: 20, generationTps: 8, coldStartMs: 1000 } },
    { profile: { id: 'hybrid-12' }, metrics: { promptTps: 18, generationTps: 10, coldStartMs: 1200 } },
  ], 'balanced');
  assert.equal(winner.profile.id, 'hybrid-12');
  assert.equal(ranked.some((row) => row.profile.id === 'fast-invalid'), false);
});

test('interactive scoring prefers generation throughput', () => {
  assert.ok(scoreProfile({ promptTps: 10, generationTps: 30, coldStartMs: 0 }, 'interactive')
    > scoreProfile({ promptTps: 40, generationTps: 8, coldStartMs: 0 }, 'interactive'));
});

test('llama-bench markdown parser reads pp and tg rows', () => {
  const parsed = parseLlamaBench('| model | pp512 | 12.5 |\n| model | tg128 | 7.25 ± 0.1 |');
  assert.equal(parsed.promptTps, 12.5);
  assert.equal(parsed.generationTps, 7.25);
});
