import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { existsSync, mkdirSync, mkdtempSync, readFileSync as rfs, rmSync, truncateSync, writeFileSync } from 'node:fs';
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

test('start spawns the preferred profile even under memory pressure (OS pages)', async () => {
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
    assert.equal(record.profileId, 'cpu-4', 'first profile is used; RAM math does not veto');
    assert.equal(spawned.length, 1);
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

test('sweepIdle evicts over-cap and stale specialists, keeps the resident nexus', async () => {
  const manifest = sampleManifest();
  const registry = new AgentRegistry(manifest);
  const children = [];
  const manager = new ProcessManager({
    manifest,
    registry,
    hostAdapter: { applyPriority() {} },
    spawnImpl: () => { const c = new FakeChild(); children.push(c); return c; },
    fetchImpl: async () => ({ ok: true }),
  });
  manager.maxWarmSpecialists = 1;
  manager.idleEvictMs = 10_000;
  const now = Date.now();
  const put = (alias, resident, lastUsedAt) => manager.processes.set(alias, {
    alias, resident, owned: true, state: 'ready', createdAt: now, lastUsedAt,
    child: new FakeChild(),
  });
  put('tool-router-agent', true, now);                 // resident - never evicted
  put('general-text-speculator', false, now - 1_000);  // fresh, within warm cap
  put('qwenstral-code-speculator', false, now - 2_000); // over cap (cap = 1)
  put('vision-layout-agent', false, now - 60_000);      // stale + over cap

  const evicted = await manager.sweepIdle(now);
  assert.ok(evicted.includes('qwenstral-code-speculator'));
  assert.ok(evicted.includes('vision-layout-agent'));
  assert.ok(!evicted.includes('tool-router-agent'), 'resident nexus survives');
  assert.ok(!evicted.includes('general-text-speculator'), 'most-recent specialist stays warm');
  assert.ok(manager.processes.has('tool-router-agent'));
  assert.ok(!manager.processes.has('vision-layout-agent'));
});

test('startIdleSweeper is a no-op when idle eviction is disabled', () => {
  const manager = new ProcessManager({ manifest: sampleManifest(), registry: new AgentRegistry(sampleManifest()) });
  manager.idleEvictMs = 0;
  manager.startIdleSweeper();
  assert.equal(manager.idleSweeper, null);
});

test('buildLaunch defaults the KV cache to q8_0, honours an explicit profile choice, and f16 opt-out', () => {
  const manifest = sampleManifest();
  const agent = manifest.agents.find((item) => item.alias === 'tool-router-agent');
  const registry = new AgentRegistry(manifest);
  const manager = new ProcessManager({ manifest, registry, spawnImpl() { throw new Error('no spawn'); } });

  const dflt = manager.buildLaunch(agent, { id: 'cpu-2', args: ['--device', 'none'] });
  assert.deepEqual(
    [dflt.args[dflt.args.indexOf('--cache-type-k') + 1], dflt.args[dflt.args.indexOf('--cache-type-v') + 1]],
    ['q8_0', 'q8_0'],
  );

  const explicit = manager.buildLaunch(agent, { id: 'cpu-2', args: ['--device', 'none', '--cache-type-k', 'q4_0', '--cache-type-v', 'q4_0'] });
  assert.equal(explicit.args.filter((a) => a === '--cache-type-k').length, 1);
  assert.equal(explicit.args[explicit.args.indexOf('--cache-type-k') + 1], 'q4_0');

  const f16 = manager.buildLaunch({ ...agent, kv_cache: 'f16' }, { id: 'cpu-2', args: ['--device', 'none'] });
  assert.equal(f16.args.includes('--cache-type-k'), false);
});

test('embedding and reranker backends never get a quantized KV cache (they fail to decode with one)', () => {
  const manifest = sampleManifest();
  const registry = new AgentRegistry(manifest);
  const manager = new ProcessManager({ manifest, registry, spawnImpl() { throw new Error('no spawn'); } });
  for (const alias of ['semantic-embedding-agent', 'retrieval-rerank-agent']) {
    const agent = manifest.agents.find((a) => a.alias === alias);
    const launch = manager.buildLaunch(agent, { id: 'x', args: ['--device', 'none'] });
    assert.equal(launch.args.includes('--cache-type-k'), false, `${alias} must not get --cache-type-k`);
  }
  // a text agent still does
  const text = manifest.agents.find((a) => a.alias === 'general-text-speculator');
  assert.equal(manager.buildLaunch(text, { id: 'x', args: ['--device', 'none'] }).args.includes('--cache-type-k'), true);
});

test('waitForReady tolerates whisper/sd-server which have no /health (404 on it)', async () => {
  const manifest = sampleManifest();
  manifest.runtimes.stable_diffusion.command = process.execPath;
  const registry = new AgentRegistry(manifest);
  const agent = manifest.agents.find((a) => a.alias === 'image-generation-agent');
  registry.setStatus(agent.alias, 'cold');
  const child = new FakeChild();
  let hits = 0;
  const manager = new ProcessManager({
    manifest, registry, hostAdapter: { applyPriority() {} },
    spawnImpl: () => child,
    fetchImpl: async (url) => { hits += 1; return { status: url.endsWith('/health') ? 404 : 200, ok: !url.endsWith('/health') && true, async arrayBuffer() { return new ArrayBuffer(0); } }; },
  });
  const rec = await manager.start(agent);          // must not time out on the 404 /health
  assert.equal(rec.state, 'ready');
  await manager.stop(agent.alias);
});

test('evictForNewSpecialist drops the LRU warm specialist to make room (maxWarm 1)', async () => {
  const manager = new ProcessManager({ manifest: sampleManifest(), registry: new AgentRegistry(sampleManifest()), spawnImpl() { throw new Error('no'); } });
  manager.maxWarmSpecialists = 2;
  const now = Date.now();
  manager.processes.set('vision-layout-agent', { alias: 'vision-layout-agent', owned: true, resident: false, state: 'ready', child: new FakeChild(), lastUsedAt: now - 5000 });
  manager.processes.set('general-text-speculator', { alias: 'general-text-speculator', owned: true, resident: false, state: 'ready', child: new FakeChild(), lastUsedAt: now - 1000 });
  manager.canSuspend = false;   // force terminate path for a deterministic assertion
  const { terminated } = await manager.evictForNewSpecialist('qwenstral-code-speculator');
  assert.deepEqual(terminated, ['vision-layout-agent']);      // older one goes; 1 slot kept for the incoming
  assert.ok(!manager.processes.has('vision-layout-agent'));
  assert.ok(manager.processes.has('general-text-speculator')); // most-recent stays
});

test('suspend/resume: an over-ceiling CPU model is frozen (SIGSTOP), revived by SIGCONT', async () => {
  const manifest = sampleManifest();
  const registry = new AgentRegistry(manifest);
  const signals = [];
  const manager = new ProcessManager({
    manifest,
    registry,
    spawnImpl() { throw new Error('no'); },
    fetchImpl: async () => ({ ok: true, status: 200 }),
  });
  manager.canSuspend = true;
  manager.suspendImpl = (pid) => signals.push(['STOP', pid]);
  manager.resumeImpl = (pid) => signals.push(['CONT', pid]);
  manager.maxWarmSpecialists = 1;
  const now = Date.now();
  // qwenstral-code-speculator has a cpu-4 profile in the sample manifest
  manager.processes.set('qwenstral-code-speculator', { alias: 'qwenstral-code-speculator', owned: true, resident: false, state: 'ready', profileId: 'cpu-4', createdAt: now, lastUsedAt: now - 9000, child: Object.assign(new FakeChild(), { pid: 42 }) });

  const out = await manager.evictForNewSpecialist('general-text-speculator');
  assert.deepEqual(out.suspended, ['qwenstral-code-speculator']);
  assert.deepEqual(out.terminated, []);
  assert.equal(signals[0][0], 'STOP');
  assert.equal(manager.processes.get('qwenstral-code-speculator').state, 'suspended');

  // ensure() revives it via SIGCONT instead of cold-starting
  const agent = manifest.agents.find((a) => a.alias === 'qwenstral-code-speculator');
  const revived = await manager.ensure(agent);
  assert.equal(revived.state, 'ready');
  assert.ok(signals.some((s) => s[0] === 'CONT'));
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

  // launch args carry --slot-save-path AND the dir is pre-created
  // (llama-server exits 1 with "not a directory" otherwise)
  const launch = manager.buildLaunch(agent, { id: 'x', args: ['--device', 'none'] });
  assert.ok(launch.args.includes('--slot-save-path'));
  assert.ok(launch.args.includes('--cache-idle-slots'));
  assert.ok(existsSync(launch.args[launch.args.indexOf('--slot-save-path') + 1]), 'slot-save-path dir must exist before spawn');

  const cp = await manager.checkpointModel(agent.alias, 'snap1');
  assert.equal(cp.filename, 'snap1.bin');
  assert.match(calls.at(-1).url, /\/slots\/0\?action=save/);
  assert.equal(calls.at(-1).body.filename, 'snap1.bin');

  assert.equal(await manager.restoreModel(agent.alias), true);       // newest
  assert.match(calls.at(-1).url, /\/slots\/0\?action=restore/);
  assert.equal(calls.at(-1).body.filename, 'snap1.bin');

  await manager.stop(agent.alias);
  assert.ok(calls.some((c) => /action=save/.test(c.url) && c.body.filename === 'on-stop.bin'));

  rmSync(dir, { recursive: true, force: true });
});

test('anti-thrash: cold-starts are serialized and a critically-low box gets a 503, not an OOM', async () => {
  const manifest = sampleManifest();
  const registry = new AgentRegistry(manifest);
  registry.setStatus('qwenstral-code-speculator', 'cold');
  registry.setStatus('general-text-speculator', 'cold');
  let free = 200 * 1024 * 1024;   // critically low
  let inFlight = 0; let maxInFlight = 0;
  const manager = new ProcessManager({
    manifest, registry,
    hostAdapter: { applyPriority() {}, sampleResources: () => ({ freeMemoryBytes: free }) },
    spawnImpl: () => new FakeChild(),
    fetchImpl: async () => ({ ok: true }),
  });
  const realStartProfile = manager.startProfile.bind(manager);
  manager.startProfile = async (...args) => {
    inFlight += 1; maxInFlight = Math.max(maxInFlight, inFlight);
    try { await new Promise((r) => setTimeout(r, 15)); return await realStartProfile(...args); }
    finally { inFlight -= 1; }
  };

  await assert.rejects(
    () => manager.ensure(manifest.agents.find((a) => a.alias === 'qwenstral-code-speculator')),
    (e) => /critically low/.test(e.message) && e.status === 503,
  );

  free = 40 * 1024 ** 3;   // plenty now
  const a = manager.ensure(manifest.agents.find((x) => x.alias === 'qwenstral-code-speculator'));
  const b = manager.ensure(manifest.agents.find((x) => x.alias === 'general-text-speculator'));
  await Promise.all([a, b]);
  assert.equal(maxInFlight, 1, 'never two specialists cold-starting at once');
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
  assert.equal(snap.state, 'snapA.bin');            // the KV file
  assert.equal(snap.profileId, 'cpu-4');
  assert.equal(snap.prime.promptSha, 'abc123');     // extra descriptor fields merge through
  assert.ok(existsSync(snap.descriptor));
  const d = JSON.parse(rfs(snap.descriptor, 'utf8'));
  assert.equal(d.alias, alias);
  assert.ok('model' in d.data);
  assert.equal(d.prime.promptSha, 'abc123');
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

  // no resolver -> no restore
  assert.equal(await manager.maybeRestoreDefault(agent, record), false);

  const descDir = path.join(dir, agent.alias.replace(/[^a-z0-9-]/gi, '_'));
  mkdirSync(descDir, { recursive: true });
  const writeDesc = (obj) => writeFileSync(path.join(descDir, 'default.snapshot.json'), JSON.stringify(obj));

  writeDesc({ state: 'default.bin', data: { model: agent.model }, code: { command: '/opt/llama-server' }, prime: { promptSha: 'MATCH' } });
  manager.stockPromptSha = () => 'MATCH';
  assert.equal(await manager.maybeRestoreDefault(agent, record), true);
  assert.equal(restoreCalls.length, 1);
  assert.equal(record.primed, true);

  // stale prompt -> skipped
  manager.stockPromptSha = () => 'DIFFERENT';
  assert.equal(await manager.maybeRestoreDefault(agent, record), false);
  assert.equal(restoreCalls.length, 1);

  // wrong binary -> skipped
  manager.stockPromptSha = () => 'MATCH';
  writeDesc({ state: 'default.bin', data: { model: agent.model }, code: { command: '/other/llama-server' }, prime: { promptSha: 'MATCH' } });
  assert.equal(await manager.maybeRestoreDefault(agent, record), false);

  rmSync(dir, { recursive: true, force: true });
});

test('pin skips sweepIdle; unpin then sweep evicts', async () => {
  const manager = new ProcessManager({
    manifest: sampleManifest(),
    registry: new AgentRegistry(sampleManifest()),
    spawnImpl() { throw new Error('no'); },
    fetchImpl: async () => ({ ok: true, status: 200 }),
  });
  manager.maxWarmSpecialists = 0;
  manager.idleEvictMs = 10;
  manager.canSuspend = false;
  const now = Date.now();
  manager.processes.set('qwenstral-code-speculator', {
    alias: 'qwenstral-code-speculator', owned: true, resident: false, state: 'ready',
    createdAt: now - 60_000, lastUsedAt: now - 60_000, child: new FakeChild(), refs: 0,
  });
  const unpin = manager.pin('qwenstral-code-speculator');
  const skipped = await manager.sweepIdle(now);
  assert.equal(skipped.includes('qwenstral-code-speculator'), false);
  assert.ok(manager.processes.has('qwenstral-code-speculator'));
  unpin();
  const evicted = await manager.sweepIdle(now);
  assert.ok(evicted.includes('qwenstral-code-speculator'));
});

test('resume without /health 200 restarts rather than ready', async () => {
  const manifest = sampleManifest();
  const registry = new AgentRegistry(manifest);
  const manager = new ProcessManager({
    manifest,
    registry,
    spawnImpl() { throw new Error('no spawn'); },
    fetchImpl: async () => ({ ok: false, status: 503 }),
  });
  manager.canSuspend = true;
  manager.suspendImpl = () => {};
  manager.resumeImpl = () => {};
  const child = Object.assign(new FakeChild(), { pid: 99 });
  manager.processes.set('qwenstral-code-speculator', {
    alias: 'qwenstral-code-speculator', owned: true, resident: false, state: 'suspended',
    profileId: 'cpu-4', child, createdAt: Date.now(), lastUsedAt: Date.now(), refs: 0,
  });
  const resumed = await manager.resume('qwenstral-code-speculator');
  assert.equal(resumed, null);
  assert.equal(manager.processes.has('qwenstral-code-speculator'), false);
});

test('restoreModel is skipped while refs>0', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'grz-restore-pin-'));
  const manifest = sampleManifest();
  manifest.gateway.checkpoint_dir = dir;
  const calls = [];
  const manager = new ProcessManager({
    manifest, registry: new AgentRegistry(manifest), spawnImpl() { throw new Error('no'); },
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), body: init?.body && JSON.parse(init.body) });
      return { ok: true, status: 200 };
    },
  });
  const agent = manifest.agents.find((a) => a.alias === 'general-text-speculator');
  manager.processes.set(agent.alias, {
    alias: agent.alias, owned: true, resident: false, state: 'ready', child: new FakeChild(),
    createdAt: Date.now(), refs: 1, checkpoints: [{ tag: 'snap1', filename: 'snap1.bin', at: Date.now() }],
  });
  assert.equal(await manager.restoreModel(agent.alias), false);
  assert.equal(calls.some((c) => /action=restore/.test(c.url)), false);
  manager.processes.get(agent.alias).refs = 0;
  assert.equal(await manager.restoreModel(agent.alias), true);
});

test('timed-out cpu-4 does not retry cpu-6', async () => {
  const manifest = sampleManifest();
  const agent = manifest.agents.find((item) => item.alias === 'qwenstral-code-speculator');
  agent.profiles = [
    { id: 'cpu-4', args: ['--device', 'none', '--threads', '4', '--n-gpu-layers', '0'] },
    { id: 'cpu-6', args: ['--device', 'none', '--threads', '6', '--n-gpu-layers', '0'] },
  ];
  const registry = new AgentRegistry(manifest);
  registry.setStatus(agent.alias, 'cold');
  const spawned = [];
  const manager = new ProcessManager({
    manifest,
    registry,
    hostAdapter: { applyPriority() { return true; }, sampleResources() { return { freeMemoryBytes: 40 * 1024 ** 3 }; } },
    spawnImpl: (_command, args) => {
      spawned.push(args);
      throw new Error('timed out');
    },
    fetchImpl: async () => ({ ok: true }),
  });
  await assert.rejects(() => manager.start(agent), /timed out|Unavailable|Failed to start/);
  assert.equal(spawned.length, 1);
  assert.ok(spawned[0].includes('4'));
  assert.equal(spawned.some((args) => args.includes('6') && args[args.indexOf('--threads') + 1] === '6'), false);
});

test('empty CPU set does not spawn', async () => {
  const { CpuSetAllocator } = await import('../src/cpu-set.mjs');
  const manifest = sampleManifest();
  const agent = manifest.agents.find((item) => item.alias === 'qwenstral-code-speculator');
  agent.extra_args = ['--threads', '4', '--threads-batch', '4'];
  const registry = new AgentRegistry(manifest);
  registry.setStatus(agent.alias, 'cold');
  const spawned = [];
  const manager = new ProcessManager({
    manifest,
    registry,
    hostAdapter: { applyPriority() { return true; }, sampleResources() { return { freeMemoryBytes: 40 * 1024 ** 3 }; } },
    spawnImpl: () => { spawned.push('x'); return new FakeChild(); },
    fetchImpl: async () => ({ ok: true }),
  });
  manager.cpuAllocator = new CpuSetAllocator(0);
  await assert.rejects(() => manager.start(agent), /cpu_oversubscribed|Unable to start|oversubscribed/);
  assert.equal(spawned.length, 0);
});

test('Cursor nexus --threads stays 4; buildLaunch injects --no-webui and strips --metrics', () => {
  const raw = JSON.parse(rfs(new URL('../config/agents.cursor.json', import.meta.url)));
  const nexus = raw.agents.find((a) => a.alias === 'tool-router-agent');
  const cpu4 = (nexus.profiles ?? []).find((p) => p.id === 'cpu-4');
  assert.ok(cpu4);
  assert.equal(cpu4.args[cpu4.args.indexOf('--threads') + 1], '4');
  const manifest = sampleManifest();
  const agent = manifest.agents.find((a) => a.alias === 'tool-router-agent');
  const registry = new AgentRegistry(manifest);
  const manager = new ProcessManager({ manifest, registry, spawnImpl() { throw new Error('no'); } });
  const launch = manager.buildLaunch(agent, { id: 'cpu-2', args: ['--device', 'none', '--metrics', '1'] });
  assert.ok(launch.args.includes('--no-webui'));
  assert.equal(launch.args.includes('--metrics'), false);
});

test('extra_args --host 0.0.0.0 is refused', () => {
  const manifest = sampleManifest();
  const agent = manifest.agents.find((a) => a.alias === 'general-text-speculator');
  agent.extra_args = ['--host', '0.0.0.0'];
  const manager = new ProcessManager({
    manifest, registry: new AgentRegistry(manifest), spawnImpl() { throw new Error('no'); },
  });
  assert.throws(
    () => manager.buildLaunch(agent, { id: 'cpu-4', args: ['--device', 'none'] }),
    /0\.0\.0\.0|public_bind/,
  );
});

test('PF7: canSuspend defaults false (no SIGSTOP of bound llama)', () => {
  const manager = new ProcessManager({
    manifest: sampleManifest(),
    registry: new AgentRegistry(sampleManifest()),
    spawnImpl() { throw new Error('no'); },
  });
  assert.equal(manager.canSuspend, false);
});

test('PF7: waitForPortsFree treats connect-timeout / listening as busy (fail closed)', async () => {
  const manager = new ProcessManager({
    manifest: sampleManifest(),
    registry: new AgentRegistry(sampleManifest()),
    spawnImpl() { throw new Error('no'); },
  });
  // Fake a busy port: portBusy returns true
  manager.portBusy = async () => true;
  const ok = await manager.waitForPortsFree([59999], { timeoutMs: 300 });
  assert.equal(ok, false);
});

test('PF4: buildLaunch prepends LD_LIBRARY_PATH instead of clobbering', () => {
  const prev = process.env.LD_LIBRARY_PATH;
  process.env.LD_LIBRARY_PATH = '/usr/local/lib';
  try {
    const manifest = sampleManifest();
    manifest.runtimes.llama_server.env = { LD_LIBRARY_PATH: '/pack/runtime' };
    const registry = new AgentRegistry(manifest);
    const manager = new ProcessManager({ manifest, registry, spawnImpl() { throw new Error('no spawn'); } });
    const agent = manifest.agents.find((a) => a.alias === 'tool-router-agent');
    const launch = manager.buildLaunch(agent, { id: 'cpu-2', args: ['--device', 'none'] });
    assert.match(launch.env.LD_LIBRARY_PATH, /\/pack\/runtime/);
    assert.match(launch.env.LD_LIBRARY_PATH, /\/usr\/local\/lib/);
    assert.ok(launch.env.LD_LIBRARY_PATH.startsWith('/pack/runtime'));
  } finally {
    if (prev === undefined) delete process.env.LD_LIBRARY_PATH;
    else process.env.LD_LIBRARY_PATH = prev;
  }
});

test('PF4: spawn options include cwd packRoot', async () => {
  const manifest = sampleManifest();
  const registry = new AgentRegistry(manifest);
  const spawned = [];
  const manager = new ProcessManager({
    manifest,
    registry,
    spawnImpl: (command, args, opts) => {
      spawned.push({ command, args, opts });
      const child = new FakeChild();
      queueMicrotask(() => child.emit('exit', 0, null));
      return child;
    },
    fetchImpl: async () => ({ ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(0) }),
  });
  manager.packRoot = '/tmp/grz-pack-root';
  manager.cpuAllocator.allocate = () => [0, 1];
  const agent = manifest.agents.find((a) => a.alias === 'tool-router-agent');
  agent.profiles = [{ id: 'cpu-2', args: ['--device', 'none', '--threads', '2', '--threads-batch', '2', '--n-gpu-layers', '0'] }];
  try {
    await manager.startProfile(agent, agent.profiles[0]);
  } catch {
    // may fail health; we only care spawn opts
  }
  assert.ok(spawned.length >= 1);
  assert.equal(spawned[0].opts.cwd, '/tmp/grz-pack-root');
  assert.equal(spawned[0].opts.shell, false);
  assert.equal(spawned[0].opts.windowsHide, true);
});

test('PF1: stopAll on empty manager is ok; childrenSnapshot empty', async () => {
  const manager = new ProcessManager({
    manifest: sampleManifest(),
    registry: new AgentRegistry(sampleManifest()),
    spawnImpl() { throw new Error('no'); },
  });
  await manager.stopAll();
  assert.deepEqual(manager.childrenSnapshot(), []);
  assert.deepEqual(manager.ownedPorts().sort(), [18080].sort());
});

test('RF4: waitForReady rejects when child exits after health probe', async () => {
  const manifest = sampleManifest();
  const registry = new AgentRegistry(manifest);
  const agent = manifest.agents.find((a) => a.alias === 'tool-router-agent');
  const child = new FakeChild();
  const manager = new ProcessManager({
    manifest,
    registry,
    hostAdapter: { applyPriority() {} },
    spawnImpl: () => child,
    fetchImpl: async () => {
      // Health looks ready, but the child died during the probe (stale listener case).
      child.exitCode = 1;
      return { ok: true, status: 200, async arrayBuffer() { return new ArrayBuffer(0); } };
    },
  });
  manager.cpuAllocator.allocate = () => [0, 1];
  agent.profiles = [{ id: 'cpu-2', args: ['--device', 'none', '--threads', '2', '--threads-batch', '2', '--n-gpu-layers', '0'] }];
  await assert.rejects(
    () => manager.startProfile(agent, agent.profiles[0]),
    (err) => /exited with 1 after health probe|Failed to start/.test(String(err.message)),
  );
});

test('RF4: stopRecord awaits exit after SIGKILL (timer alone is not enough)', async () => {
  const manifest = sampleManifest();
  const registry = new AgentRegistry(manifest);
  const manager = new ProcessManager({
    manifest,
    registry,
    spawnImpl() { throw new Error('no'); },
  });
  class StickyChild extends EventEmitter {
    constructor() {
      super();
      this.pid = 9991;
      this.exitCode = null;
      this.killed = [];
      this.stdout = new EventEmitter();
      this.stderr = new EventEmitter();
    }
    kill(signal) {
      this.killed.push(signal);
      if (signal === 'SIGKILL') {
        // Exit only after a short delay — old Promise.race would return on the timer first.
        setTimeout(() => {
          this.exitCode = 1;
          this.emit('exit', 1, signal);
        }, 50);
      }
    }
  }
  const child = new StickyChild();
  const record = { alias: 'general-text-speculator', owned: true, child, state: 'ready' };
  manager.processes.set(record.alias, record);
  // Shrink the SIGTERM deadline so the test is fast.
  const orig = manager.stopRecord.bind(manager);
  // Monkey: call stopRecord but with a patched setTimeout via temporary override of kill path
  // by replacing the method's 3000 with racing a shorter path — instead invoke stopRecord
  // after patching child.kill to ignore SIGTERM and only exit on SIGKILL delayed.
  child.kill = function kill(signal) {
    this.killed.push(signal);
    if (signal === 'SIGTERM') return; // ignore soft kill
    if (signal === 'SIGKILL') {
      setTimeout(() => {
        this.exitCode = 1;
        this.emit('exit', 1, signal);
      }, 30);
    }
  };
  const started = Date.now();
  await manager.stopRecord(record);
  assert.ok(record.child.exitCode !== null, 'must wait until exitCode is set');
  assert.ok(child.killed.includes('SIGKILL'));
  assert.ok(Date.now() - started >= 30);
});

test('RF4: evictForNewSpecialist throws when ports stay busy after stop', async () => {
  const manager = new ProcessManager({
    manifest: sampleManifest(),
    registry: new AgentRegistry(sampleManifest()),
    spawnImpl() { throw new Error('no'); },
  });
  manager.maxWarmSpecialists = 1;
  manager.canSuspend = false;
  const now = Date.now();
  const child = new FakeChild();
  manager.processes.set('general-text-speculator', {
    alias: 'general-text-speculator', owned: true, resident: false, state: 'ready',
    child, lastUsedAt: now - 5000, refs: 0,
  });
  manager.waitForPortsFree = async () => false;
  await assert.rejects(
    () => manager.evictForNewSpecialist('qwenstral-code-speculator'),
    (err) => err?.code === 'port_busy' || /ports still busy/.test(String(err.message)),
  );
});
