import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadManifest, validateManifest } from '../src/config.mjs';
import { ValidationError } from '../src/errors.mjs';
import { sampleManifest } from './helpers.mjs';
import { REQUIRED_ALIASES } from '../src/constants.mjs';

test('windows manifest has exactly eleven required aliases and no translation agent', async () => {
  const manifest = await loadManifest(new URL('../config/agents.windows.json', import.meta.url));
  const aliases = manifest.agents.map((agent) => agent.alias);
  assert.deepEqual([...aliases].sort(), [...REQUIRED_ALIASES].sort());
  assert.equal(aliases.includes('translation-agent'), false);
  assert.equal(manifest.gateway.policy, 'maximize');
  assert.equal(manifest.agents.find((agent) => agent.alias === 'general-text-speculator').draft_type, 'draft-eagle3');
  assert.equal(manifest.agents.find((agent) => agent.alias === 'qwenstral-code-speculator').profiles[0].id, 'vulkan-all');
  assert.equal(manifest.agents.find((agent) => agent.alias === 'general-text-speculator').profiles[0].id, 'vulkan-all');
  const monitor = manifest.agents.find((agent) => agent.alias === 'security-monitor-agent');
  assert.equal(monitor.runtime, 'logical');
  assert.equal(monitor.model, undefined);
  assert.equal(monitor.required_artifacts, undefined);
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

test('default manifest is portable cursor (not windows/shalom)', async () => {
  const { readFileSync } = await import('node:fs');
  const raw = readFileSync(new URL('../config/agents.cursor.json', import.meta.url), 'utf8');
  assert.ok(!raw.includes('/workspace/green-roomz'), 'raw cursor json must be portable');
  const manifest = await loadManifest();
  assert.match(manifest.manifest_version, /cursor/i);
  assert.equal(manifest.gateway.policy, 'responsive');
  const nexus = manifest.agents.find((a) => a.alias === 'tool-router-agent');
  assert.deepEqual(nexus.languages, ['en']);
  assert.ok(String(nexus.model).includes('Qwenstral-Small-3.1-0.5B'));
  const code = manifest.agents.find((a) => a.alias === 'qwenstral-code-speculator');
  assert.ok(!String(code.model).includes('Qwenstral-Small-3.1-0.5B'), '0.5B must not bind code');
  const textAgent = manifest.agents.find((a) => a.alias === 'general-text-speculator');
  assert.ok(!String(textAgent.model).includes('Qwenstral-Small-3.1-0.5B'), '0.5B must not bind general-text');
});
