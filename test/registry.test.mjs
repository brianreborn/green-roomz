import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, truncateSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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
  assert.deepEqual(vision.callable_capabilities, []);
  assert.deepEqual(vision.ready_capabilities, []);
  assert.deepEqual(vision.capability_readiness, {
    state: 'unavailable',
    callable: false,
    loaded: false,
    reasons: vision.unavailable_reasons,
  });
  assert.equal(vision.routing_behavior, 'modality_override');
  const monitor = models.find((model) => model.id === 'security-monitor-agent');
  assert.equal(monitor.availability, 'ready');
  assert.equal(monitor.routing_behavior, 'mailbox');
  assert.deepEqual(monitor.unavailable_reasons, []);
  assert.deepEqual(monitor.callable_capabilities, ['text', 'json']);
  assert.deepEqual(monitor.ready_capabilities, ['text', 'json']);
  assert.equal(monitor.capability_readiness.callable, true);
  assert.equal(monitor.capability_readiness.loaded, true);
});

test('inspect keeps a memory-tight specialist available (OS pages), not unavailable', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'grz-inspect-ram-'));
  const model = path.join(dir, 'model.gguf');
  writeFileSync(model, '');
  truncateSync(model, Math.round(4.36 * 1024 ** 3));
  try {
    const manifest = sampleManifest();
    manifest.runtimes.llama_server.command = process.execPath;
    const agent = manifest.agents.find((item) => item.alias === 'qwenstral-code-speculator');
    agent.model = model;
    agent.draft_enabled = false;
    agent.profiles = [
      { id: 'cpu-4', args: ['--device', 'none', '--n-gpu-layers', '0'] },
      { id: 'vulkan-all', args: ['--device', 'Vulkan0', '--n-gpu-layers', 'all'] },
    ];
    const registry = await new AgentRegistry(manifest).inspect({
      hostAdapter: { sampleResources() { return { freeMemoryBytes: 1 }; } },
    });
    const status = registry.status('qwenstral-code-speculator');
    // Default admit_when_tight=refuse: too-big specialist is unavailable (impractical), not "page anyway".
    assert.equal(status.state, 'unavailable');
    assert.ok((status.missing ?? []).some((reason) => String(reason).startsWith('impractical')));

    manifest.gateway.admit_when_tight = 'page';
    const paged = await new AgentRegistry(manifest).inspect({
      hostAdapter: { sampleResources() { return { freeMemoryBytes: 1 }; } },
    });
    const pagedStatus = paged.status('qwenstral-code-speculator');
    assert.notEqual(pagedStatus.state, 'unavailable', 'admit_when_tight=page keeps it available (OS pages)');
    assert.ok(!(pagedStatus.missing ?? []).some((reason) => String(reason).startsWith('impractical')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
