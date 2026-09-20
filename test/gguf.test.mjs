import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readGgufInfo } from '../src/gguf.mjs';
import { writeGgufBlockCount } from './helpers.mjs';

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
