import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadOptionalBrainz } from '../src/brainz.mjs';

test('Brainz import skips when GREEN_BRAINZ_ROOT is unset', async () => {
  const loaded = await loadOptionalBrainz({ env: { ...process.env, GREEN_BRAINZ_ROOT: '' } });
  assert.equal(loaded.enabled, false);
  assert.match(loaded.reason, /unset/);
});
