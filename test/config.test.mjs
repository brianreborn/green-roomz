import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadManifest, validateManifest } from '../src/config.mjs';
import { ValidationError } from '../src/errors.mjs';
import { sampleManifest } from './helpers.mjs';
import { REQUIRED_ALIASES } from '../src/constants.mjs';

test('windows manifest has exactly eleven required aliases and no translation agent', async () => {
  const manifest = await loadManifest();
  const aliases = manifest.agents.map((agent) => agent.alias);
  assert.deepEqual([...aliases].sort(), [...REQUIRED_ALIASES].sort());
  assert.equal(aliases.includes('translation-agent'), false);
  assert.equal(manifest.gateway.policy, 'responsive');
  assert.equal(manifest.gateway.timing_privacy, 'off');
  assert.equal(manifest.gateway.max_warm_specialists, 1);
  assert.equal(manifest.gateway.admit_when_tight, 'refuse');
  assert.equal(manifest.gateway.apply_store_winners, false);
  assert.equal(manifest.gateway.nexus_consult_timeout_ms, 10000);
  assert.equal(manifest.gateway.agent_chat_timeout_ms, 60000);
  assert.equal(manifest.gateway.agent_max_tokens, 96);
  assert.deepEqual(manifest.gateway.health_aliases, ['tool-router-agent', 'general-text-speculator']);
  const monitor = manifest.agents.find((agent) => agent.alias === 'security-monitor-agent');
  assert.equal(monitor.runtime, 'logical');
  assert.equal(monitor.model, undefined);
  assert.equal(monitor.required_artifacts, undefined);
});

test('timing_privacy must be chosen at install', () => {
  const manifest = sampleManifest();
  delete manifest.gateway.timing_privacy;
  let caught;
  try { validateManifest(manifest); } catch (error) { caught = error; }
  assert.ok(caught instanceof ValidationError);
  assert.match(String(caught.details), /timing_privacy is required/);
});

test('agent_chat_timeout_ms and agent_max_tokens are required at install', () => {
  const missingTimeout = sampleManifest();
  delete missingTimeout.gateway.agent_chat_timeout_ms;
  let caughtTimeout;
  try { validateManifest(missingTimeout); } catch (error) { caughtTimeout = error; }
  assert.ok(caughtTimeout instanceof ValidationError);
  assert.match(String(caughtTimeout.details), /agent_chat_timeout_ms/);

  const missingTokens = sampleManifest();
  delete missingTokens.gateway.agent_max_tokens;
  let caughtTokens;
  try { validateManifest(missingTokens); } catch (error) { caughtTokens = error; }
  assert.ok(caughtTokens instanceof ValidationError);
  assert.match(String(caughtTokens.details), /agent_max_tokens/);
});

test('health_aliases is required at install', () => {
  const missing = sampleManifest();
  delete missing.gateway.health_aliases;
  let caught;
  try { validateManifest(missing); } catch (error) { caught = error; }
  assert.ok(caught instanceof ValidationError);
  assert.match(String(caught.details), /health_aliases/);
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
