import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_THREADS, allocateSets, disjoint, CpuSetAllocator } from '../src/cpu-set.mjs';

test('allocateSets 8-way 4+4 is disjoint', () => {
  const [a, b] = allocateSets(8, [{ threads: 4 }, { threads: 4 }]);
  assert.deepEqual(a, [0, 1, 2, 3]);
  assert.deepEqual(b, [4, 5, 6, 7]);
  assert.equal(disjoint(a, b), true);
  const numeric = allocateSets(8, [4, 4]);
  assert.equal(disjoint(numeric[0], numeric[1]), true);
  const nexusStyle = allocateSets(8, [{ nexus: 4 }, { threads: 4 }]);
  assert.equal(disjoint(nexusStyle[0], nexusStyle[1]), true);
});

test('allocateSets 8-way 4+6 leaves specialist empty', () => {
  const [nexus, specialist] = allocateSets(8, [{ threads: 4 }, { threads: 6 }]);
  assert.equal(nexus.length, 4);
  assert.deepEqual(specialist, []);
});

test('allocateSets 4-way 4+4 leaves specialist empty (no wrap)', () => {
  const [first, second] = allocateSets(4, [{ threads: 4 }, { threads: 4 }]);
  assert.equal(first.length, 4);
  assert.deepEqual(second, []);
  const allocator = new CpuSetAllocator(4);
  assert.deepEqual(allocator.allocate('nexus', 4), [0, 1, 2, 3]);
  assert.deepEqual(allocator.allocate('specialist', 4), []);
  assert.equal(DEFAULT_THREADS, 4);
});
