import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync, truncateSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ProcessManager, orderProfiles, vulkanAllThreadCount, withVulkanAllThreads } from '../src/process-manager.mjs';
import { DEFAULT_THREADS, defaultThreadCount } from '../src/cpu-set.mjs';
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
      { id: 'cpu-4', args: ['--device', 'none', '--n-gpu-layers', '0', '--threads', '4', '--threads-batch', '4'] },
      { id: 'vulkan-all', args: ['--device', 'Vulkan0', '--n-gpu-layers', 'all'] },
    ];
    const registry = new AgentRegistry(manifest);
    registry.setStatus(agent.alias, 'cold');
    const spawned = [];
    const child = new FakeChild();
    const manager = new ProcessManager({
      manifest,
      registry,
      logicalCpus: 2,
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
    logicalCpus: 8,
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

test('C1 empty profiles stay valid but default threads cap to logical CPUs', () => {
  assert.deepEqual(orderProfiles({ alias: 'vision-layout-agent' }, []).map((p) => p.id), ['default']);
  assert.equal(defaultThreadCount(2), 2);
  assert.equal(defaultThreadCount(1), 1);
  assert.equal(defaultThreadCount(8), DEFAULT_THREADS);
  const manifest = sampleManifest();
  const agent = manifest.agents.find((item) => item.alias === 'vision-layout-agent');
  const registry = new AgentRegistry(manifest);
  const two = new ProcessManager({
    manifest,
    registry,
    logicalCpus: 2,
    spawnImpl() { throw new Error('no spawn'); },
  });
  const empty = two.buildLaunch(agent, { id: 'default', args: [] });
  assert.equal(empty.args[empty.args.indexOf('--threads') + 1], '2');
  assert.equal(empty.args[empty.args.indexOf('--threads-batch') + 1], '2');
  two.cpuAllocator.allocate('held', 1);
  const clamped = two.buildLaunch(agent, { id: 'default', args: [] });
  assert.equal(clamped.args[clamped.args.indexOf('--threads') + 1], '1');
  const eight = new ProcessManager({
    manifest,
    registry,
    logicalCpus: 8,
    spawnImpl() { throw new Error('no spawn'); },
  });
  const capped = eight.buildLaunch(agent, { id: 'default', args: [] });
  assert.equal(capped.args[capped.args.indexOf('--threads') + 1], String(DEFAULT_THREADS));
});

test('H3 canParallelCouncil is false when specialists exceed maxWarmSpecialists', () => {
  const manifest = sampleManifest({ gateway: { max_warm_specialists: 1 } });
  const registry = new AgentRegistry(manifest);
  const manager = new ProcessManager({ manifest, registry, spawnImpl() { throw new Error('no spawn'); } });
  assert.equal(manager.maxWarmSpecialists, 1);
  assert.equal(manager.canParallelCouncil(['qwenstral-code-speculator', 'general-text-speculator'], true), false);
  assert.equal(manager.canParallelCouncil(['tool-router-agent', 'general-text-speculator'], true), true);
  assert.equal(manager.canParallelCouncil(['qwenstral-code-speculator', 'general-text-speculator'], false), false);
  assert.equal(manager.canParallelCouncil(['qwenstral-code-speculator'], true), false);
  manager.maxWarmSpecialists = 2;
  assert.equal(manager.canParallelCouncil(['qwenstral-code-speculator', 'general-text-speculator'], true), true);
});

test('L3 failed start deletes the map row so a later ensure is not a zombie', async () => {
  const manifest = sampleManifest();
  const agent = manifest.agents.find((item) => item.alias === 'qwenstral-code-speculator');
  agent.profiles = [{ id: 'cpu-1', args: ['--device', 'none', '--n-gpu-layers', '0', '--threads', '1', '--threads-batch', '1'] }];
  const registry = new AgentRegistry(manifest);
  registry.setStatus(agent.alias, 'cold');
  const manager = new ProcessManager({
    manifest,
    registry,
    logicalCpus: 2,
    hostAdapter: { applyPriority() { return true; } },
    spawnImpl: () => {
      const child = new FakeChild();
      child.exitCode = 1;
      queueMicrotask(() => child.emit('exit', 1, null));
      return child;
    },
    fetchImpl: async () => ({ ok: false, status: 503 }),
  });
  await assert.rejects(() => manager.start(agent));
  assert.equal(manager.processes.has(agent.alias), false);
  assert.equal(manager.processes.get(agent.alias)?.state, undefined);
  assert.equal(manager.cpuAllocator.remaining(), 2);
  registry.setStatus(agent.alias, 'cold');
  await assert.rejects(() => manager.ensure(agent));
  assert.equal(manager.processes.has(agent.alias), false);
  assert.equal(manager.cpuAllocator.remaining(), 2);
});

test('L3 exited first profile is dropped before the next profile starts', async () => {
  const manifest = sampleManifest();
  const agent = manifest.agents.find((item) => item.alias === 'qwenstral-code-speculator');
  agent.profiles = [
    { id: 'cpu-4', args: ['--device', 'none', '--n-gpu-layers', '0'] },
    { id: 'vulkan-all', args: ['--device', 'Vulkan0', '--n-gpu-layers', 'all'] },
  ];
  const registry = new AgentRegistry(manifest);
  registry.setStatus(agent.alias, 'cold');
  const spawned = [];
  const manager = new ProcessManager({
    manifest,
    registry,
    logicalCpus: 8,
    hostAdapter: {
      applyPriority() { return true; },
      sampleResources() { return { freeMemoryBytes: 20 * 1024 ** 3 }; },
    },
    spawnImpl: (_command, args) => {
      const child = new FakeChild();
      spawned.push(args);
      if (args.includes('none')) {
        child.exitCode = 1;
        queueMicrotask(() => child.emit('exit', 1, null));
      }
      return child;
    },
    fetchImpl: async () => ({ ok: true }),
  });
  const record = await manager.start(agent);
  assert.equal(record.profileId, 'vulkan-all');
  assert.equal(spawned.length, 2);
  assert.equal(manager.processes.size, 1);
  assert.equal(manager.processes.get(agent.alias)?.state, 'ready');
  await manager.stop(agent.alias);
  assert.equal(manager.processes.has(agent.alias), false);
});
