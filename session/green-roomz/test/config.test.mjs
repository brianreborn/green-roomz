import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadManifest, validateManifest } from '../src/config.mjs';
import { ValidationError } from '../src/errors.mjs';
import { sampleManifest } from './helpers.mjs';
import { REQUIRED_ALIASES } from '../src/constants.mjs';

test('windows manifest has exactly ten required aliases and no translation agent', async () => {
  const manifest = await loadManifest();
  const aliases = manifest.agents.map((agent) => agent.alias);
  assert.deepEqual([...aliases].sort(), [...REQUIRED_ALIASES].sort());
  assert.equal(aliases.includes('translation-agent'), false);
  assert.equal(manifest.gateway.policy, 'maximize');
  assert.equal(manifest.agents.find((agent) => agent.alias === 'general-text-speculator').draft_type, 'draft-eagle3');
  assert.equal(manifest.agents.find((agent) => agent.alias === 'qwenstral-code-speculator').profiles[0].id, 'vulkan-all');
  assert.equal(manifest.agents.find((agent) => agent.alias === 'general-text-speculator').profiles[0].id, 'vulkan-all');
});

test('secrets are prohibited in manifests', () => {
  const manifest = sampleManifest();
  manifest.gateway.api_key = 'secret';
  assert.throws(() => validateManifest(manifest), ValidationError);
});

test('projector is prohibited on text-only agents', () => {
  const manifest = sampleManifest();
  manifest.agents.find((agent) => agent.alias === 'general-text-speculator').projector = 'x.bin';
  let caught;
  try { validateManifest(manifest); } catch (error) { caught = error; }
  assert.ok(caught instanceof ValidationError);
  assert.match(String(caught.details), /projector/);
});
