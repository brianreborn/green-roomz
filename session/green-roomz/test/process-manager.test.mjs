import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync, truncateSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ProcessManager, orderProfiles, vulkanAllThreadCount, withVulkanAllThreads } from '../src/process-manager.mjs';
import { AgentRegistry } from '../src/registry.mjs';
import { sampleManifest } from './helpers.mjs';

class FakeChild extends EventEmitter {
  constructor() {
    super();
    this.pid = 4242;
    this.exitCode = null;
    this.killed = [];
    this.stdout = new EventEmitter();
    this.stderr = new EventEmitter();
  }
  kill(signal) {
    this.killed.push(signal);
    this.exitCode = signal === 'SIGKILL' ? 1 : 0;
    this.emit('exit', this.exitCode, signal);
  }
}

test('duplicate ensure calls share one start and only owned children are stopped', async () => {
  const manifest = sampleManifest();
  const agent = manifest.agents.find((item) => item.alias === 'qwenstral-code-speculator');
  const registry = new AgentRegistry(manifest);
  registry.setStatus(agent.alias, 'cold');
  const spawned = [];
  const child = new FakeChild();
  const manager = new ProcessManager({
    manifest,
    registry,
    hostAdapter: { applyPriority() { return true; } },
    spawnImpl: (command, args) => {
      spawned.push({ command, args });
      return child;
    },
    fetchImpl: async () => ({ ok: true }),
  });
  const [first, second] = await Promise.all([manager.ensure(agent), manager.ensure(agent)]);
  assert.equal(first, second);
  assert.equal(spawned.length, 1);
  assert.ok(spawned[0].args.includes('--device'));
  assert.equal(first.owned, true);
  await manager.stop(agent.alias);
  assert.deepEqual(child.killed, ['SIGTERM']);
});

test('buildLaunch encodes EAGLE3 draft flags when enabled and present', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'grz-draft-'));
  const draft = path.join(dir, 'draft.gguf');
  writeFileSync(draft, 'x');
  const manifest = sampleManifest();
  const agent = manifest.agents.find((item) => item.alias === 'general-text-speculator');
  agent.draft_model = draft;
  const registry = new AgentRegistry(manifest);
  const manager = new ProcessManager({ manifest, registry, spawnImpl() { throw new Error('no spawn'); } });
  const launch = manager.buildLaunch(agent, { id: 'cpu-4', args: ['--device', 'none'] });
  assert.ok(launch.args.includes('--model-draft'));
  assert.ok(launch.args.includes('draft-eagle3'));
});

test('optional missing draft is omitted rather than passed as --model-draft', () => {
  const manifest = sampleManifest();
  const agent = manifest.agents.find((item) => item.alias === 'general-text-speculator');
  const registry = new AgentRegistry(manifest);
  const manager = new ProcessManager({ manifest, registry, spawnImpl() { throw new Error('no spawn'); } });
  const launch = manager.buildLaunch(agent, { id: 'cpu-4', args: ['--device', 'none'] });
  assert.equal(launch.args.includes('--model-draft'), false);
});

test('cpu-resident profiles are ordered after vulkan-all when measured weights exceed free RAM', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'grz-weights-'));
  const model = path.join(dir, 'model.gguf');
  writeFileSync(model, Buffer.alloc(1024));
  const agent = {
    alias: 'qwenstral-code-speculator',
    model,
    profiles: [
      { id: 'cpu-4', args: ['--device', 'none', '--n-gpu-layers', '0'] },
      { id: 'hybrid-12', args: ['--device', 'Vulkan0', '--n-gpu-layers', '12'] },
      { id: 'vulkan-all', args: ['--device', 'Vulkan0', '--n-gpu-layers', 'all'] },
    ],
  };
  const ids = orderProfiles(agent, agent.profiles, { freeMemoryBytes: 512 }).map((profile) => profile.id);
  assert.deepEqual(ids, ['hybrid-12', 'vulkan-all', 'cpu-4']);
});

test('manifest profile order is kept when weight size is unknown', () => {
  const agent = {
    alias: 'qwenstral-code-speculator',
    model: '/tmp/missing-code.gguf',
    profiles: [
      { id: 'cpu-4', args: ['--device', 'none', '--n-gpu-layers', '0'] },
      { id: 'vulkan-all', args: ['--device', 'Vulkan0', '--n-gpu-layers', 'all'] },
    ],
  };
  const ids = orderProfiles(agent, agent.profiles, { freeMemoryBytes: 1 }).map((profile) => profile.id);
  assert.deepEqual(ids, ['cpu-4', 'vulkan-all']);
});

test('start skips cpu-4 spawn when not admitted and uses vulkan-all instead', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'grz-admit-start-'));
  const model = path.join(dir, 'model.gguf');
  writeFileSync(model, '');
  truncateSync(model, Math.round(4.36 * 1024 ** 3));
  try {
    const manifest = sampleManifest();
    const agent = manifest.agents.find((item) => item.alias === 'qwenstral-code-speculator');
    agent.model = model;
    agent.draft_enabled = false;
    agent.profiles = [
      { id: 'cpu-4', args: ['--device', 'none', '--n-gpu-layers', '0'] },
      { id: 'vulkan-all', args: ['--device', 'Vulkan0', '--n-gpu-layers', 'all'] },
    ];
    const registry = new AgentRegistry(manifest);
    registry.setStatus(agent.alias, 'cold');
    const spawned = [];
    const child = new FakeChild();
    const manager = new ProcessManager({
      manifest,
      registry,
      hostAdapter: {
        applyPriority() { return true; },
        sampleResources() { return { freeMemoryBytes: 5 * 1024 ** 3 }; },
      },
      spawnImpl: (_command, args) => {
        spawned.push(args);
        return child;
      },
      fetchImpl: async () => ({ ok: true }),
    });
    const record = await manager.start(agent);
    assert.equal(record.profileId, 'vulkan-all');
    assert.equal(spawned.length, 1);
    assert.equal(spawned[0][spawned[0].indexOf('--device') + 1], 'Vulkan0');
    await manager.stop(agent.alias);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('start tries the next profile after a non-abort startProfile failure', async () => {
  const manifest = sampleManifest();
  const agent = manifest.agents.find((item) => item.alias === 'qwenstral-code-speculator');
  agent.profiles = [
    { id: 'cpu-4', args: ['--device', 'none', '--n-gpu-layers', '0'] },
    { id: 'vulkan-all', args: ['--device', 'Vulkan0', '--n-gpu-layers', 'all'] },
  ];
  const registry = new AgentRegistry(manifest);
  registry.setStatus(agent.alias, 'cold');
  const spawned = [];
  const child = new FakeChild();
  const manager = new ProcessManager({
    manifest,
    registry,
    hostAdapter: {
      applyPriority() { return true; },
      sampleResources() { return { freeMemoryBytes: 20 * 1024 ** 3 }; },
    },
    spawnImpl: (_command, args) => {
      spawned.push(args);
      if (args.includes('none')) throw new Error('simulated spawn failure');
      return child;
    },
    fetchImpl: async () => ({ ok: true }),
  });
  const record = await manager.start(agent);
  assert.equal(record.profileId, 'vulkan-all');
  assert.equal(spawned.length, 2);
  await manager.stop(agent.alias);
});

test('vulkan-all uses logical CPUs minus two (6 on an 8-thread APU)', () => {
  assert.equal(vulkanAllThreadCount(8), 6);
  assert.equal(vulkanAllThreadCount(4), 2);
  const vulkan = withVulkanAllThreads(['--threads', '4', '--threads-batch', '4', '--n-gpu-layers', 'all'], 8);
  assert.equal(vulkan[vulkan.indexOf('--threads') + 1], '6');
  assert.equal(vulkan[vulkan.indexOf('--threads-batch') + 1], '6');
});

test('buildLaunch rewrites vulkan-all threads and leaves cpu-4 threads alone', () => {
  const manifest = sampleManifest();
  const agent = manifest.agents.find((item) => item.alias === 'qwenstral-code-speculator');
  const registry = new AgentRegistry(manifest);
  const manager = new ProcessManager({ manifest, registry, spawnImpl() { throw new Error('no spawn'); } });
  const vulkan = manager.buildLaunch(agent, { id: 'vulkan-all', args: ['--device', 'Vulkan0', '--threads', '4', '--threads-batch', '4', '--n-gpu-layers', 'all'] });
  assert.equal(vulkan.args[vulkan.args.indexOf('--threads') + 1], String(vulkanAllThreadCount()));
  const cpu = manager.buildLaunch(agent, { id: 'cpu-4', args: ['--device', 'none', '--threads', '4', '--threads-batch', '4', '--n-gpu-layers', '0'] });
  assert.equal(cpu.args[cpu.args.indexOf('--threads') + 1], '4');
});

test('ensure specialist does not stop the resident nexus', async () => {
  const manifest = sampleManifest();
  const nexus = manifest.agents.find((item) => item.alias === 'tool-router-agent');
  const code = manifest.agents.find((item) => item.alias === 'qwenstral-code-speculator');
  const registry = new AgentRegistry(manifest);
  registry.setStatus(nexus.alias, 'cold');
  registry.setStatus(code.alias, 'cold');
  const children = [];
  const manager = new ProcessManager({
    manifest,
    registry,
    hostAdapter: { applyPriority() { return true; } },
    spawnImpl: () => {
      const child = new FakeChild();
      child.pid = 5000 + children.length;
      children.push(child);
      return child;
    },
    fetchImpl: async () => ({ ok: true }),
  });
  const first = await manager.ensure(nexus);
  const second = await manager.ensure(code);
  assert.equal(manager.processes.size, 2);
  assert.equal(first.resident, true);
  assert.equal(first.child.exitCode, null);
  assert.deepEqual(children[0].killed, []);
  assert.equal(second.alias, 'qwenstral-code-speculator');
  const launch = manager.buildLaunch(nexus, { id: 'cpu-2', args: ['--device', 'none', '--threads', '2', '--threads-batch', '2', '--n-gpu-layers', '0'] });
  assert.equal(launch.args[launch.args.indexOf('--threads') + 1], '2');
  assert.equal(launch.args[launch.args.indexOf('--port') + 1], '18187');
  await manager.stopAll();
});
