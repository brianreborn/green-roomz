import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AgentRegistry } from '../src/registry.mjs';
import { sampleManifest } from './helpers.mjs';
import { REQUIRED_ALIASES } from '../src/constants.mjs';

test('missing artifacts degrade only the affected alias', async () => {
  const registry = await new AgentRegistry(sampleManifest()).inspect();
  const models = registry.listModels();
  assert.equal(models.length, REQUIRED_ALIASES.length);
  const router = models.find((model) => model.id === 'tool-router-agent');
  assert.equal(router.availability, 'unavailable');
  assert.equal(router.routing_behavior, 'nexus');
  assert.equal(router.resident, true);
  const vision = models.find((model) => model.id === 'vision-layout-agent');
  assert.equal(vision.availability, 'unavailable');
  assert.ok(vision.unavailable_reasons.some((reason) => reason.startsWith('model:')));
  assert.ok(vision.native_capabilities.includes('image'));
  assert.equal(vision.routing_behavior, 'modality_override');
});
