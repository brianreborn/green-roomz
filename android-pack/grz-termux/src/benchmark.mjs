import { execFile } from 'node:child_process';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { digestObject } from './util.mjs';
import { selectProfile } from './profile-selector.mjs';
import { profileAdmitted } from './memory.mjs';
import { cloneWithGpuLayers, expandLayerProfiles, readBlockCount, refineAround } from './autotune.mjs';

const execFileAsync = promisify(execFile);
const BENCH_ARG_MAP = new Map([
  ['--threads', '--threads'],
  ['--n-gpu-layers', '--n-gpu-layers'],
  ['--batch-size', '--batch-size'],
  ['--ubatch-size', '--ubatch-size'],
  ['--cache-type-k', '--cache-type-k'],
  ['--cache-type-v', '--cache-type-v'],
  ['--device', '--device'],
  ['--split-mode', '--split-mode'],
  ['--main-gpu', '--main-gpu'],
]);
const BOOLEAN_BENCH_ARGS = new Set(['--no-op-offload', '--op-offload']);

function toBenchArgs(profile) {
  const output = [];
  for (let index = 0; index < (profile.args ?? []).length; index += 1) {
    const key = profile.args[index];
    if (BOOLEAN_BENCH_ARGS.has(key)) {
      output.push('--no-op-offload', key === '--no-op-offload' ? '1' : '0');
      continue;
    }
    if (!BENCH_ARG_MAP.has(key)) continue;
    let value = profile.args[index + 1];
    index += 1;
    if (key === '--n-gpu-layers' && value === 'all') value = '99';
    output.push(BENCH_ARG_MAP.get(key), String(value));
  }
  return output;
}

export function parseLlamaBench(output) {
  let promptTps;
  let generationTps;
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/\|\s*(pp\d+|tg\d+)\s*\|\s*([0-9.]+)\s*(?:±[^|]*)?\|/);
    if (!match) continue;
    if (match[1].startsWith('pp')) promptTps = Number(match[2]);
    if (match[1].startsWith('tg')) generationTps = Number(match[2]);
  }
  if (!Number.isFinite(promptTps) || !Number.isFinite(generationTps)) throw new Error('Unable to parse llama-bench output');
  return { promptTps, generationTps };
}

function hasUsableMetrics(entry) {
  return Boolean(entry?.metrics) && !entry.skipped;
}

function hasFullMetrics(entry) {
  return hasUsableMetrics(entry) && entry.quick !== true;
}

function rankIncludingSkipped(results, objective) {
  const picked = selectProfile(results, objective);
  const extra = results.filter((row) => !picked.ranked.some((item) => item.profile?.id === row.profile?.id));
  return { winner: picked.winner, ranked: [...picked.ranked, ...extra] };
}

export class BenchmarkStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.data = { schema_version: 1, results: {} };
  }

  async load() {
    try {
      const parsed = JSON.parse(await readFile(this.filePath, 'utf8'));
      if (parsed.schema_version === 1 && parsed.results) this.data = parsed;
    } catch {}
    return this;
  }

  get(key) { return this.data.results[key]; }
  set(key, value) { this.data.results[key] = value; }

  async save() {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const temp = `${this.filePath}.${process.pid}.tmp`;
    await writeFile(temp, JSON.stringify(this.data, null, 2));
    await rename(temp, this.filePath);
  }
}

export class BenchmarkRunner {
  constructor({ manifest, registry, hostAdapter, storePath = path.resolve('data/benchmarks.json'), exec = execFileAsync }) {
    this.manifest = manifest;
    this.registry = registry;
    this.hostAdapter = hostAdapter;
    this.store = new BenchmarkStore(storePath);
    this.exec = exec;
  }

  sampleFreeMemory() {
    try {
      return this.hostAdapter?.sampleResources?.()?.freeMemoryBytes;
    } catch {
      return undefined;
    }
  }

  async fingerprint(agent, profile) {
    const host = await this.hostAdapter.fingerprint();
    const runtime = this.manifest.runtimes[agent.runtime];
    return digestObject({ host: host.id, manifest: this.manifest._meta.digest, runtime: runtime?.command, agent: agent.alias, model: agent.model, projector: agent.projector, profile });
  }

  async runLlamaProfile(agent, profile, { quick = false } = {}) {
    const runtime = this.manifest.runtimes[agent.runtime];
    const benchCommand = runtime.command.replace(/llama-server\.exe$/i, 'llama-bench.exe').replace(/llama-server$/i, 'llama-bench');
    const args = [
      '--model', agent.model,
      '--n-prompt', quick ? '64' : '256',
      '--n-gen', quick ? '16' : '64',
      '--repetitions', quick ? '1' : '3',
      '--prio', '-1',
      '--split-mode', 'none',
      '--output', 'md',
      ...toBenchArgs(profile),
    ];
    const started = Date.now();
    const result = await this.exec(benchCommand, args, { windowsHide: true, timeout: quick ? 180_000 : 600_000, maxBuffer: 4 * 1024 * 1024 });
    return { ...parseLlamaBench(`${result.stdout}\n${result.stderr}`), coldStartMs: Date.now() - started };
  }

  vulkanTemplate(profiles) {
    return (profiles ?? []).find((profile) => profile.id === 'vulkan-all')
      ?? (profiles ?? []).find((profile) => /^hybrid-\d+$/.test(profile.id ?? ''));
  }

  async measureProfile(agent, profile, { alias, quick, force, requireFull, freeMemoryBytes }) {
    const key = await this.fingerprint(agent, profile);
    let cached = force ? undefined : this.store.get(key);
    if (cached?.skipped) cached = undefined;
    if (cached && hasUsableMetrics(cached) && (!requireFull || hasFullMetrics(cached))) {
      return { ...cached, key, alias, profile };
    }
    const admission = profileAdmitted(agent, profile, { freeMemoryBytes, includeDraft: false });
    if (!admission.ok) {
      return {
        key,
        alias,
        profile,
        skipped: true,
        reason: 'impractical',
        estimateBytes: admission.estimateBytes,
        freeMemoryBytes,
        measured_at: new Date().toISOString(),
      };
    }
    try {
      const runQuick = requireFull ? false : quick;
      const metrics = await this.runLlamaProfile(agent, profile, { quick: runQuick });
      const entry = {
        key,
        alias,
        profile,
        metrics,
        measured_at: new Date().toISOString(),
      };
      if (runQuick) entry.quick = true;
      this.store.set(key, entry);
      await this.store.save();
      return entry;
    } catch (error) {
      return {
        key,
        alias,
        profile,
        skipped: true,
        reason: error.message,
        error: error.message,
        freeMemoryBytes,
        measured_at: new Date().toISOString(),
      };
    }
  }

  replaceResult(results, entry) {
    const index = results.findIndex((row) => row.profile?.id === entry.profile?.id);
    if (index === -1) results.push(entry);
    else results[index] = entry;
  }

  async qualify(alias, { quick = false, force = false, objective = 'balanced' } = {}) {
    await this.store.load();
    const agent = this.registry.get(alias);
    if (agent.runtime === 'logical') return { alias, winner: { profile: agent.profiles[0], metrics: { promptTps: 0, generationTps: 0, coldStartMs: 0 } }, ranked: [] };
    const runtime = this.manifest.runtimes[agent.runtime];
    if (runtime.kind !== 'llama-server') throw new Error(`Benchmark adapter for ${runtime.kind} is not provisioned yet`);
    const nLayers = readBlockCount(agent.model);
    const profiles = expandLayerProfiles(agent, nLayers);
    const results = [];
    let freeMemoryBytes = this.sampleFreeMemory();

    for (const profile of profiles) {
      const entry = await this.measureProfile(agent, profile, {
        alias,
        quick: true,
        force,
        freeMemoryBytes,
      });
      results.push(entry);
      if (this.hostAdapter?.sampleResources) freeMemoryBytes = this.sampleFreeMemory();
    }

    if (!quick) {
      let picked = rankIncludingSkipped(results, objective);
      if (picked.winner?.profile?.id && /^hybrid-\d+$/.test(picked.winner.profile.id) && Number.isFinite(nLayers)) {
        const template = this.vulkanTemplate(profiles) ?? picked.winner.profile;
        for (const point of refineAround(picked.winner.profile.id, nLayers)) {
          if (results.some((row) => row.profile?.id === `hybrid-${point}`)) continue;
          const extra = cloneWithGpuLayers(template, point, `hybrid-${point}`);
          const entry = await this.measureProfile(agent, extra, {
            alias,
            quick: true,
            force,
            freeMemoryBytes,
          });
          results.push(entry);
          if (this.hostAdapter?.sampleResources) freeMemoryBytes = this.sampleFreeMemory();
        }
        picked = rankIncludingSkipped(results, objective);
      }
      const finalists = picked.ranked.filter((row) => hasUsableMetrics(row)).slice(0, 2);
      for (const row of finalists) {
        const entry = await this.measureProfile(agent, row.profile, {
          alias,
          quick: false,
          force: false,
          requireFull: true,
          freeMemoryBytes,
        });
        this.replaceResult(results, entry);
        if (this.hostAdapter?.sampleResources) freeMemoryBytes = this.sampleFreeMemory();
      }
    }

    return { alias, nLayers, ...rankIncludingSkipped(results, objective) };
  }
}

export function winnersFromStore(storeData, objective = 'throughput') {
  const grouped = new Map();
  for (const entry of Object.values(storeData?.results ?? {})) {
    if (!entry?.alias || !entry?.profile) continue;
    if (entry.skipped) continue;
    if (!grouped.has(entry.alias)) grouped.set(entry.alias, []);
    grouped.get(entry.alias).push(entry);
  }
  const winners = new Map();
  for (const [alias, results] of grouped) {
    const { winner } = selectProfile(results, objective);
    if (winner?.profile?.id) winners.set(alias, winner.profile.id);
  }
  return winners;
}

export async function applyStoreWinners(processes, { storePath, objective = 'throughput' } = {}) {
  const store = new BenchmarkStore(storePath ?? path.resolve('data/benchmarks.json'));
  await store.load();
  for (const [alias, profileId] of winnersFromStore(store.data, objective)) {
    processes.selectedProfiles.set(alias, profileId);
  }
  return processes.selectedProfiles;
}

export async function qualifyMissingAgents({
  manifest,
  registry,
  hostAdapter,
  processes,
  objective = 'throughput',
  quick = false,
  force = false,
  storePath,
  exec,
} = {}) {
  const runner = new BenchmarkRunner({ manifest, registry, hostAdapter, storePath, exec });
  const qualified = [];
  const skipped = [];
  for (const agent of manifest.agents ?? []) {
    if (agent.runtime !== 'llama_server') continue;
    if (!(agent.profiles?.length)) continue;
    const availability = registry.status(agent.alias);
    if (availability.state === 'unavailable') {
      skipped.push({ alias: agent.alias, reasons: availability.missing });
      continue;
    }
    if (processes.selectedProfiles.get(agent.alias)) continue;
    qualified.push(await runner.qualify(agent.alias, { quick, force, objective }));
  }
  await applyStoreWinners(processes, { storePath: storePath ?? runner.store.filePath, objective });
  return { selectedProfiles: processes.selectedProfiles, qualified, skipped };
}
