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
  assert.equal(manifest.gateway.timing_privacy, 'off');
  assert.equal(manifest.gateway.max_warm_specialists, 2);
  assert.equal(manifest.gateway.admit_when_tight, 'refuse');
  assert.equal(manifest.gateway.apply_store_winners, false);
  assert.equal(manifest.gateway.nexus_consult_timeout_ms, 25000);
  assert.equal(manifest.gateway.handoff_peek_timeout_ms, 20000);
  assert.equal(manifest.gateway.agent_chat_timeout_ms, 600000);
  assert.equal(manifest.gateway.agent_max_tokens, 768);
  assert.equal(manifest.gateway.memory_transcript_chars, 2048);
  assert.equal(manifest.gateway.memory_facts_limit, 8);
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

test('memory_transcript_chars and memory_facts_limit are required at install', () => {
  const missingChars = sampleManifest();
  delete missingChars.gateway.memory_transcript_chars;
  let caughtChars;
  try { validateManifest(missingChars); } catch (error) { caughtChars = error; }
  assert.ok(caughtChars instanceof ValidationError);
  assert.match(String(caughtChars.details), /memory_transcript_chars/);

  const missingFacts = sampleManifest();
  delete missingFacts.gateway.memory_facts_limit;
  let caughtFacts;
  try { validateManifest(missingFacts); } catch (error) { caughtFacts = error; }
  assert.ok(caughtFacts instanceof ValidationError);
  assert.match(String(caughtFacts.details), /memory_facts_limit/);
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
