import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import {
  expandLayerProfiles,
  hybridLayerPoints,
  readBlockCount,
  refineAround,
} from '../src/autotune.mjs';
import { writeGgufBlockCount } from './helpers.mjs';

const execFileAsync = promisify(execFile);

const vulkan = { id: 'vulkan-all', args: ['--device', 'Vulkan0', '--op-offload', '--n-gpu-layers', 'all', '--threads', '4'] };
const hybrid12 = { id: 'hybrid-12', args: ['--device', 'Vulkan0', '--op-offload', '--n-gpu-layers', '12', '--threads', '4'] };
const cpu4 = { id: 'cpu-4', args: ['--device', 'none', '--no-op-offload', '--n-gpu-layers', '0', '--threads', '4'] };

test('hybridLayerPoints 28 yields 7, 14, 21', () => {
  assert.deepEqual(hybridLayerPoints(28), [7, 14, 21]);
});

test('hybridLayerPoints 36 yields 9, 18, 27', () => {
  assert.deepEqual(hybridLayerPoints(36), [9, 18, 27]);
});

test('readBlockCount parses qwen2.block_count UINT32', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'grz-gguf-'));
  try {
    const file = path.join(dir, 'model.gguf');
    writeGgufBlockCount(file, 28, { prefixKey: 'general.architecture' });
    assert.equal(readBlockCount(file), 28);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('readBlockCount returns null when unreadable', () => {
  assert.equal(readBlockCount('/tmp/grz-missing-model.gguf'), null);
  assert.equal(readBlockCount(''), null);
  assert.equal(readBlockCount(undefined), null);
});

test('expandLayerProfiles 28 replaces hybrid-12 with 7/14/21 cloned from vulkan', () => {
  const expanded = expandLayerProfiles({
    model: '/tmp/missing.gguf',
    profiles: [vulkan, hybrid12, cpu4],
  }, 28);
  assert.deepEqual(expanded.map((profile) => profile.id), ['vulkan-all', 'hybrid-7', 'hybrid-14', 'hybrid-21', 'cpu-4']);
  const seven = expanded.find((profile) => profile.id === 'hybrid-7');
  assert.equal(seven.args[seven.args.indexOf('--n-gpu-layers') + 1], '7');
  assert.equal(seven.args[seven.args.indexOf('--device') + 1], 'Vulkan0');
  assert.ok(seven.args.includes('--op-offload'));
  assert.equal(expanded.find((profile) => profile.id === 'cpu-4').args[1], 'none');
  assert.equal(expanded.find((profile) => profile.id === 'hybrid-12'), undefined);
});

test('expandLayerProfiles keeps hybrid-12 when layer count is unknown', () => {
  const expanded = expandLayerProfiles({
    model: '/tmp/missing.gguf',
    profiles: [vulkan, hybrid12, cpu4],
  });
  assert.deepEqual(expanded.map((profile) => profile.id), ['vulkan-all', 'hybrid-12', 'cpu-4']);
});

test('expandLayerProfiles does not duplicate ids', () => {
  const expanded = expandLayerProfiles({
    profiles: [vulkan, hybrid12, { ...hybrid12 }, cpu4],
  }, 28);
  const ids = expanded.map((profile) => profile.id);
  assert.equal(ids.length, new Set(ids).size);
});

test('refineAround hybrid winner adds step neighbors; vulkan-all and cpu-4 do not', () => {
  assert.deepEqual(refineAround('hybrid-14', 28), [10, 18]);
  assert.deepEqual(refineAround('hybrid-7', 28), [3, 11]);
  assert.deepEqual(refineAround('hybrid-21', 28), [17, 25]);
  assert.deepEqual(refineAround('vulkan-all', 28), []);
  assert.deepEqual(refineAround('cpu-4', 28), []);
});

test('usage lists deploy --quick', async () => {
  const cli = fileURLToPath(new URL('../bin/green-roomz.mjs', import.meta.url));
  const { stdout } = await execFileAsync(process.execPath, [cli, '--help']);
  assert.match(stdout, /deploy \[--manifest path\] \[--host address\] \[--port number\] \[--quick\]/);
});
