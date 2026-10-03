import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { BenchmarkRunner, qualifyMissingAgents, winnersFromStore } from '../src/benchmark.mjs';
import { AgentRegistry } from '../src/registry.mjs';
import { sampleManifest } from './helpers.mjs';
import { writeGgufBlockCount } from './helpers.mjs';

function llamaMarkdown(pp, tg) {
  return `| model | pp64 | ${pp} |\n| model | tg16 | ${tg} |\n`;
}

test('qualify continues after a thrown profile and still returns a winner from the other profile', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'grz-qualify-'));
  const storePath = path.join(dir, 'benchmarks.json');
  try {
    const manifest = sampleManifest();
    manifest._meta = { digest: 'test-digest' };
    const agent = manifest.agents.find((item) => item.alias === 'qwenstral-code-speculator');
    agent.profiles = [
      { id: 'cpu-4', args: ['--device', 'none', '--n-gpu-layers', '0'] },
      { id: 'vulkan-all', args: ['--device', 'Vulkan0', '--n-gpu-layers', 'all'] },
    ];
    const registry = new AgentRegistry(manifest);
    registry.setStatus(agent.alias, 'cold');
    const ran = [];
    const runner = new BenchmarkRunner({
      manifest,
      registry,
      hostAdapter: {
        async fingerprint() { return { id: 'test-host' }; },
        sampleResources() { return { freeMemoryBytes: 20 * 1024 ** 3 }; },
      },
      storePath,
      exec: async (_command, args) => {
        const ngl = args[args.indexOf('--n-gpu-layers') + 1];
        ran.push(ngl);
        if (ngl === '0') throw new Error('simulated OOM');
        return { stdout: llamaMarkdown(24.36, 1.93), stderr: '' };
      },
    });
    const result = await runner.qualify(agent.alias, { quick: true, force: true, objective: 'throughput' });
    assert.deepEqual(ran, ['0', '99']);
    assert.equal(result.winner.profile.id, 'vulkan-all');
    assert.equal(result.winner.metrics.promptTps, 24.36);
    assert.equal(result.ranked.some((row) => row.profile.id === 'cpu-4' && row.skipped), true);
    assert.notEqual(result.winner.profile.id, 'cpu-4');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('winnersFromStore picks vulkan-all from a benchmarks.json-shaped fixture', () => {
  const storeData = {
    schema_version: 1,
    results: {
      e4a43e47e079607352a1eace04594b4afc07138609a9e1c182254375ac8c406f: {
        alias: 'qwenstral-code-speculator',
        profile: { id: 'vulkan-all' },
        metrics: { promptTps: 27.22, generationTps: 2.55, coldStartMs: 122162 },
      },
      '2583b4a651aa7b5e9a65f57efcc84e63dd4e697478ec30053c16c7f615a375a9': {
        alias: 'qwenstral-code-speculator',
        profile: { id: 'hybrid-12' },
        metrics: { promptTps: 22.93, generationTps: 3.56, coldStartMs: 106207 },
      },
      '7a3d60421340e02dbe039b210cb732f9629730fba03c659836ce6fc5912ba8f3': {
        alias: 'qwenstral-code-speculator',
        profile: { id: 'cpu-4' },
        skipped: true,
        reason: 'impractical',
      },
      '5b56ad4b1161459983704197a4aad4d86ccb015dd55cea1eb33a41f63fc0e555': {
        alias: 'general-text-speculator',
        profile: { id: 'vulkan-all' },
        metrics: { promptTps: 41.33, generationTps: 5.31, coldStartMs: 64277 },
      },
      '1b48fb04b3d09290991b5d332125325f00ae13138be750bff9a18d83d2d6d9d7': {
        alias: 'general-text-speculator',
        profile: { id: 'hybrid-12' },
        metrics: { promptTps: 38.06, generationTps: 4.16, coldStartMs: 76393 },
      },
      '2773f56b7d6bfcb7f1621ec4d06362595dad06855d512334a16e0100e68361c6': {
        alias: 'general-text-speculator',
        profile: { id: 'cpu-4' },
        metrics: { promptTps: 22.69, generationTps: 8.05, coldStartMs: 72785 },
      },
    },
  };
  const winners = winnersFromStore(storeData, 'throughput');
  assert.equal(winners.get('qwenstral-code-speculator'), 'vulkan-all');
  assert.equal(winners.get('general-text-speculator'), 'vulkan-all');
  assert.equal(winners.size, 2);
});


function threeProfiles() {
  return [
    { id: 'vulkan-all', args: ['--device', 'Vulkan0', '--n-gpu-layers', 'all'] },
    { id: 'hybrid-12', args: ['--device', 'Vulkan0', '--n-gpu-layers', '12'] },
    { id: 'cpu-4', args: ['--device', 'none', '--n-gpu-layers', '0'] },
  ];
}

test('qualify uses expanded hybrid ids from GGUF block_count 28', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'grz-expand-'));
  const model = path.join(dir, 'model.gguf');
  writeGgufBlockCount(model, 28);
  try {
    const manifest = sampleManifest();
    manifest._meta = { digest: 'test-digest' };
    const agent = manifest.agents.find((item) => item.alias === 'qwenstral-code-speculator');
    agent.model = model;
    agent.profiles = threeProfiles();
    const registry = new AgentRegistry(manifest);
    registry.setStatus(agent.alias, 'cold');
    const ran = [];
    const runner = new BenchmarkRunner({
      manifest,
      registry,
      hostAdapter: {
        async fingerprint() { return { id: 'test-host' }; },
        sampleResources() { return { freeMemoryBytes: 20 * 1024 ** 3 }; },
      },
      storePath: path.join(dir, 'benchmarks.json'),
      exec: async (_command, args) => {
        ran.push(args[args.indexOf('--n-gpu-layers') + 1]);
        const ngl = args[args.indexOf('--n-gpu-layers') + 1];
        const pp = ngl === '99' ? 40 : 10;
        return { stdout: llamaMarkdown(pp, 2), stderr: '' };
      },
    });
    const result = await runner.qualify(agent.alias, { quick: true, force: true, objective: 'throughput' });
    assert.deepEqual(ran, ['99', '7', '14', '21', '0']);
    assert.deepEqual(result.ranked.filter((row) => !row.skipped).map((row) => row.profile.id).sort(), ['cpu-4', 'hybrid-14', 'hybrid-21', 'hybrid-7', 'vulkan-all']);
    assert.equal(result.winner.profile.id, 'vulkan-all');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('qualify without --quick refines a hybrid winner then full-benches top 2', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'grz-refine-'));
  const model = path.join(dir, 'model.gguf');
  writeGgufBlockCount(model, 28);
  try {
    const manifest = sampleManifest();
    manifest._meta = { digest: 'test-digest' };
    const agent = manifest.agents.find((item) => item.alias === 'qwenstral-code-speculator');
    agent.model = model;
    agent.profiles = threeProfiles();
    const registry = new AgentRegistry(manifest);
    registry.setStatus(agent.alias, 'cold');
    const calls = [];
    const runner = new BenchmarkRunner({
      manifest,
      registry,
      hostAdapter: {
        async fingerprint() { return { id: 'test-host' }; },
        sampleResources() { return { freeMemoryBytes: 20 * 1024 ** 3 }; },
      },
      storePath: path.join(dir, 'benchmarks.json'),
      exec: async (_command, args) => {
        const ngl = args[args.indexOf('--n-gpu-layers') + 1];
        const np = args[args.indexOf('--n-prompt') + 1];
        calls.push({ ngl, np });
        const pp = ngl === '14' ? 50 : ngl === '99' ? 40 : 20;
        return { stdout: llamaMarkdown(pp, 5), stderr: '' };
      },
    });
    const result = await runner.qualify(agent.alias, { quick: false, force: true, objective: 'throughput' });
    assert.deepEqual(calls.filter((call) => call.np === '64').map((call) => call.ngl), ['99', '7', '14', '21', '0', '10', '18']);
    assert.deepEqual(calls.filter((call) => call.np === '256').map((call) => call.ngl), ['14', '99']);
    assert.equal(result.winner.profile.id, 'hybrid-14');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('qualifyMissingAgents runs only available llama_server agents without a winner', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'grz-deploy-'));
  const model = path.join(dir, 'model.gguf');
  writeGgufBlockCount(model, 28);
  try {
    const manifest = sampleManifest();
    manifest._meta = { digest: 'test-digest' };
    const agent = manifest.agents.find((item) => item.alias === 'qwenstral-code-speculator');
    agent.model = model;
    agent.profiles = threeProfiles();
    const textAgent = manifest.agents.find((item) => item.alias === 'general-text-speculator');
    textAgent.profiles = threeProfiles();
    const registry = new AgentRegistry(manifest);
    registry.setStatus(agent.alias, 'cold');
    registry.setStatus('general-text-speculator', 'unavailable', { missing: ['model'] });
    const ran = [];
    const processes = { selectedProfiles: new Map() };
    const { selectedProfiles, skipped } = await qualifyMissingAgents({
      manifest,
      registry,
      hostAdapter: {
        async fingerprint() { return { id: 'test-host' }; },
        sampleResources() { return { freeMemoryBytes: 20 * 1024 ** 3 }; },
      },
      processes,
      objective: 'throughput',
      quick: true,
      storePath: path.join(dir, 'benchmarks.json'),
      exec: async (_command, args) => {
        const ngl = args[args.indexOf('--n-gpu-layers') + 1];
        ran.push(ngl);
        return { stdout: llamaMarkdown(ngl === '99' ? 40 : 10, 5), stderr: '' };
      },
    });
    assert.ok(ran.includes('99'));
    assert.ok(ran.includes('7'));
    assert.equal(selectedProfiles.get('qwenstral-code-speculator'), 'vulkan-all');
    assert.equal(selectedProfiles.has('general-text-speculator'), false);
    assert.equal(skipped.some((row) => row.alias === 'general-text-speculator'), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
