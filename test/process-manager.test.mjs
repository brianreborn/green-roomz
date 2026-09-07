import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, truncateSync, writeFileSync } from 'node:fs';
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

test('checkpoint/restore: save the slot KV to a named file, restore it, checkpoint on stop', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'grz-ckpt-'));
  const manifest = sampleManifest();
  manifest.gateway.checkpoint_dir = dir;
  const calls = [];
  const manager = new ProcessManager({
    manifest, registry: new AgentRegistry(manifest), spawnImpl() { throw new Error('no'); },
    fetchImpl: async (url, init) => { calls.push({ url: String(url), body: init?.body && JSON.parse(init.body) }); return { ok: true, status: 200 }; },
  });
  const agent = manifest.agents.find((a) => a.alias === 'general-text-speculator');
  const child = new FakeChild();
  manager.processes.set(agent.alias, { alias: agent.alias, owned: true, resident: false, state: 'ready', child, createdAt: Date.now() });

  const launch = manager.buildLaunch(agent, { id: 'x', args: ['--device', 'none'] });
  assert.ok(launch.args.includes('--slot-save-path'));
  assert.ok(launch.args.includes('--cache-idle-slots'));
  assert.ok(existsSync(launch.args[launch.args.indexOf('--slot-save-path') + 1]), 'slot-save-path dir must exist before spawn');

  const cp = await manager.checkpointModel(agent.alias, 'snap1');
  assert.equal(cp.filename, 'snap1.bin');
  assert.match(calls.at(-1).url, /\/slots\/0\?action=save/);
  assert.equal(calls.at(-1).body.filename, 'snap1.bin');

  assert.equal(await manager.restoreModel(agent.alias), true);
  assert.match(calls.at(-1).url, /\/slots\/0\?action=restore/);
  assert.equal(calls.at(-1).body.filename, 'snap1.bin');

  await manager.stop(agent.alias);
  assert.ok(calls.some((c) => /action=save/.test(c.url) && c.body.filename === 'on-stop.bin'));

  rmSync(dir, { recursive: true, force: true });
});

test('maybeRestoreDefault: restores the default KV only when the prime snapshot still matches', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'grz-prime-'));
  const manifest = sampleManifest();
  manifest.gateway.checkpoint_dir = dir;
  const restoreCalls = [];
  const manager = new ProcessManager({
    manifest, registry: new AgentRegistry(manifest), spawnImpl() { throw new Error('no'); },
    fetchImpl: async (url) => { if (/action=restore/.test(String(url))) restoreCalls.push(String(url)); return { ok: true, status: 200 }; },
  });
  const agent = manifest.agents.find((a) => a.alias === 'general-text-speculator');
  const record = { alias: agent.alias, owned: true, resident: false, state: 'ready', child: new FakeChild(), command: '/opt/llama-server', logs: '' };
  manager.processes.set(agent.alias, record);

  assert.equal(await manager.maybeRestoreDefault(agent, record), false);

  const descDir = path.join(dir, agent.alias.replace(/[^a-z0-9-]/gi, '_'));
  mkdirSync(descDir, { recursive: true });
  const writeDesc = (obj) => writeFileSync(path.join(descDir, 'default.snapshot.json'), JSON.stringify(obj));

  writeDesc({ state: 'default.bin', data: { model: agent.model }, code: { command: '/opt/llama-server' }, prime: { promptSha: 'MATCH' } });
  manager.stockPromptSha = () => 'MATCH';
  assert.equal(await manager.maybeRestoreDefault(agent, record), true);
  assert.equal(restoreCalls.length, 1);
  assert.equal(record.primed, true);

  manager.stockPromptSha = () => 'DIFFERENT';
  assert.equal(await manager.maybeRestoreDefault(agent, record), false);
  assert.equal(restoreCalls.length, 1);

  manager.stockPromptSha = () => 'MATCH';
  writeDesc({ state: 'default.bin', data: { model: agent.model }, code: { command: '/other/llama-server' }, prime: { promptSha: 'MATCH' } });
  assert.equal(await manager.maybeRestoreDefault(agent, record), false);

  rmSync(dir, { recursive: true, force: true });
});

test('snapshotModel writes a code+data+config+state descriptor; the .bin is the only real payload', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'grz-snap-'));
  const manifest = sampleManifest();
  manifest.gateway.checkpoint_dir = dir;
  const manager = new ProcessManager({
    manifest, registry: new AgentRegistry(manifest), spawnImpl() { throw new Error('no'); },
    fetchImpl: async () => ({ ok: true, status: 200 }),
  });
  const alias = 'qwenstral-code-speculator';
  manager.processes.set(alias, {
    alias, owned: true, resident: false, state: 'ready', child: new FakeChild(),
    command: '/opt/llama-server', args: ['--port', '18183', '--model', '/m/code.gguf', '--no-warmup'],
    profileId: 'cpu-4', createdAt: Date.now(),
  });
  const snap = await manager.snapshotModel(alias, 'snapA', { prime: { promptSha: 'abc123' } });
  assert.equal(snap.code.command, '/opt/llama-server');
  assert.ok(snap.code.args.includes('--no-warmup'));
  assert.equal(snap.state, 'snapA.bin');
  assert.equal(snap.profileId, 'cpu-4');
  assert.equal(snap.prime.promptSha, 'abc123');
  assert.ok(existsSync(snap.descriptor));
  const d = JSON.parse(readFileSync(snap.descriptor, 'utf8'));
  assert.equal(d.alias, alias);
  assert.ok('model' in d.data);
  assert.equal(d.prime.promptSha, 'abc123');
  rmSync(dir, { recursive: true, force: true });
});

test('startIdleSweeper is a no-op when idle eviction is disabled', () => {
  const manager = new ProcessManager({ manifest: sampleManifest(), registry: new AgentRegistry(sampleManifest()) });
  manager.idleEvictMs = 0;
  manager.startIdleSweeper();
  assert.equal(manager.idleSweeper, null);
});

test('sweepIdle evicts over-cap and stale specialists, keeps the resident nexus', async () => {
  const manifest = sampleManifest();
  const registry = new AgentRegistry(manifest);
  const manager = new ProcessManager({
    manifest,
    registry,
    hostAdapter: { applyPriority() {} },
    spawnImpl: () => new FakeChild(),
    fetchImpl: async () => ({ ok: true }),
  });
  manager.maxWarmSpecialists = 1;
  manager.idleEvictMs = 10_000;
  const now = Date.now();
  const put = (alias, resident, lastUsedAt) => manager.processes.set(alias, {
    alias, resident, owned: true, state: 'ready', createdAt: now, lastUsedAt,
    child: new FakeChild(),
  });
  put('tool-router-agent', true, now);
  put('general-text-speculator', false, now - 1_000);
  put('qwenstral-code-speculator', false, now - 2_000);
  put('vision-layout-agent', false, now - 60_000);

  const evicted = await manager.sweepIdle(now);
  assert.ok(evicted.includes('qwenstral-code-speculator'));
  assert.ok(evicted.includes('vision-layout-agent'));
  assert.ok(!evicted.includes('tool-router-agent'), 'resident nexus survives');
  assert.ok(!evicted.includes('general-text-speculator'), 'most-recent specialist stays warm');
  assert.ok(manager.processes.has('tool-router-agent'));
  assert.ok(!manager.processes.has('vision-layout-agent'));
});

test('evictForNewSpecialist drops the LRU warm specialist to make room (maxWarm 1)', async () => {
  const manager = new ProcessManager({ manifest: sampleManifest(), registry: new AgentRegistry(sampleManifest()), spawnImpl() { throw new Error('no'); } });
  manager.maxWarmSpecialists = 2;
  const now = Date.now();
  manager.processes.set('vision-layout-agent', { alias: 'vision-layout-agent', owned: true, resident: false, state: 'ready', child: new FakeChild(), lastUsedAt: now - 5000 });
  manager.processes.set('general-text-speculator', { alias: 'general-text-speculator', owned: true, resident: false, state: 'ready', child: new FakeChild(), lastUsedAt: now - 1000 });
  manager.canSuspend = false;
  const { terminated } = await manager.evictForNewSpecialist('qwenstral-code-speculator');
  assert.deepEqual(terminated, ['vision-layout-agent']);
  assert.ok(!manager.processes.has('vision-layout-agent'));
  assert.ok(manager.processes.has('general-text-speculator'));
});

test('waitForReady tolerates whisper/sd-server which have no /health (404 on it)', async () => {
  const manifest = sampleManifest();
  manifest.runtimes.stable_diffusion.command = process.execPath;
  const registry = new AgentRegistry(manifest);
  const agent = manifest.agents.find((a) => a.alias === 'image-generation-agent');
  registry.setStatus(agent.alias, 'cold');
  const child = new FakeChild();
  const manager = new ProcessManager({
    manifest, registry, hostAdapter: { applyPriority() {} },
    spawnImpl: () => child,
    fetchImpl: async (url) => ({ status: url.endsWith('/health') ? 404 : 200, ok: !url.endsWith('/health') && true, async arrayBuffer() { return new ArrayBuffer(0); } }),
  });
  const rec = await manager.start(agent);
  assert.equal(rec.state, 'ready');
  await manager.stop(agent.alias);
});
