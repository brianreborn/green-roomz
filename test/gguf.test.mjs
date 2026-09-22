import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { readGgufInfo } from '../src/gguf.mjs';
import { writeGgufBlockCount, writeTinyF32Gguf } from './helpers.mjs';

test('readGgufInfo extracts architecture KVs from a tiny header', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'grz-gguf-'));
  const file = path.join(dir, 'toy.gguf');
  try {
    writeGgufBlockCount(file, 24, { key: 'qwen2.block_count', prefixKey: 'general.architecture' });
    const info = readGgufInfo(file);
    assert.equal(info.format, 'gguf');
    assert.equal(info.architecture, 'qwen2');
    assert.equal(info.num_layers, 24);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('readGgufInfo hashes a tiny f32 tensor and can inline its values', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'grz-gguf-'));
  const file = path.join(dir, 'toy.gguf');
  try {
    writeTinyF32Gguf(file, [1, 2]);
    const info = readGgufInfo(file, { hash: true, values: true, maxParams: 4096 });
    assert.equal(info.quantization ?? info.file_type, 0);
    assert.equal(info.tensors.bias.dtype, 'f32');
    assert.deepEqual(info.tensors.bias.shape, [2]);
    const raw = Buffer.alloc(8);
    raw.writeFloatLE(1, 0);
    raw.writeFloatLE(2, 4);
    assert.equal(info.tensors.bias.sha256, createHash('sha256').update(raw).digest('hex'));
    assert.equal(info.tensors.bias.values[0], 1);
    assert.equal(info.tensors.bias.values[1], 2);
    const refused = readGgufInfo(file, { hash: false, values: true, maxParams: 1, tensorName: 'bias' });
    assert.equal(refused.values_refused.tensor, 'bias');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
