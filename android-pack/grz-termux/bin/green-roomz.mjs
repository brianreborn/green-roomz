#!/usr/bin/env node
import { loadManifest } from '../src/config.mjs';
import { AgentRegistry } from '../src/registry.mjs';
import { ProcessManager } from '../src/process-manager.mjs';
import { PolicyGate } from '../src/scheduler.mjs';
import { SessionLedger } from '../src/sessions.mjs';
import { WindowsHostAdapter } from '../src/hosts/windows.mjs';
import { AndroidSidecarAdapter } from '../src/hosts/android.mjs';
import { applyStoreWinners, BenchmarkRunner, qualifyMissingAgents } from '../src/benchmark.mjs';
import { Gateway } from '../src/gateway.mjs';
import { attachServeConsole } from '../src/serve-console.mjs';
import { POLICIES, REQUIRED_ALIASES } from '../src/constants.mjs';

function argValue(args, flag, fallback) {
  const index = args.indexOf(flag);
  if (index === -1) return fallback;
  return args[index + 1] ?? fallback;
}

function hasFlag(args, flag) {
  return args.includes(flag);
}

function usage() {
  return `Green-Roomz — local multimodal agent gateway

Commands:
  validate [--manifest path]
  serve [--manifest path] [--host address] [--port number]
  deploy [--manifest path] [--host address] [--port number] [--quick]
  benchmark [alias|all] [--manifest path] [--quick] [--force]
  fingerprint [--manifest path]
  doctor [--manifest path]
  agents [--manifest path]
  stop [--manifest path]   (asks a running local gateway to drain; currently local-process only)
`;
}

async function bootstrap(args) {
  const manifestPath = argValue(args, '--manifest');
  const manifest = await loadManifest(manifestPath);
  const runtime = manifest.runtimes?.llama_server?.command;
  const sidecar = process.env.GREEN_ROOMZ_ANDROID_SIDECAR;
  const hostAdapter = sidecar
    ? new AndroidSidecarAdapter({ endpoint: sidecar, token: process.env.GREEN_ROOMZ_ANDROID_TOKEN })
    : new WindowsHostAdapter({ runtimeCommand: runtime });
  const registry = await new AgentRegistry(manifest).inspect({ hostAdapter });
  const processes = new ProcessManager({ manifest, registry, hostAdapter });
  const policy = new PolicyGate(manifest.gateway.policy);
  const sessions = new SessionLedger({
    ttlMs: manifest.gateway.session_ttl_ms,
    limit: manifest.gateway.session_limit,
  });
  const objective = POLICIES[manifest.gateway.policy]?.objective ?? 'throughput';
  try {
    await applyStoreWinners(processes, { objective });
  } catch {}
  return { manifest, registry, hostAdapter, processes, policy, sessions };
}

async function cmdValidate(ctx) {
  const models = ctx.registry.listModels();
  const missing = models.filter((model) => model.availability === 'unavailable');
  console.log(JSON.stringify({
    ok: true,
    digest: ctx.manifest._meta.digest,
    required_aliases: REQUIRED_ALIASES,
    degraded: missing.map((model) => ({ id: model.id, reasons: model.unavailable_reasons })),
    agents: models,
  }, null, 2));
}

async function cmdDoctor(ctx) {
  const fingerprint = await ctx.hostAdapter.fingerprint();
  await cmdValidate(ctx);
  console.log(JSON.stringify({ fingerprint, android: Boolean(process.env.GREEN_ROOMZ_ANDROID_SIDECAR) }, null, 2));
}

async function cmdAgents(ctx) {
  console.log(JSON.stringify(ctx.registry.listModels(), null, 2));
}

async function cmdFingerprint(ctx) {
  console.log(JSON.stringify(await ctx.hostAdapter.fingerprint(), null, 2));
}

async function cmdBenchmark(ctx, args) {
  const target = args.find((item) => !item.startsWith('--') && item !== 'benchmark') ?? 'all';
  const runner = new BenchmarkRunner({
    manifest: ctx.manifest,
    registry: ctx.registry,
    hostAdapter: ctx.hostAdapter,
  });
  const aliases = target === 'all'
    ? ctx.manifest.agents.filter((agent) => agent.runtime === 'llama_server' && (agent.profiles?.length ?? 0)).map((agent) => agent.alias)
    : [target];
  const results = [];
  for (const alias of aliases) {
    const availability = ctx.registry.status(alias);
    if (availability.state === 'unavailable') {
      results.push({ alias, skipped: true, reasons: availability.missing });
      continue;
    }
    results.push(await runner.qualify(alias, {
      quick: hasFlag(args, '--quick'),
      force: hasFlag(args, '--force'),
      objective: ctx.policy.policy === 'responsive' ? 'interactive' : ctx.policy.policy === 'maximize' ? 'throughput' : 'balanced',
    }));
  }
  console.log(JSON.stringify(results, null, 2));
}

async function cmdServe(ctx, args) {
  attachServeConsole({ root: process.cwd() });
  const objective = POLICIES[ctx.manifest.gateway.policy]?.objective ?? 'throughput';
  try {
    await applyStoreWinners(ctx.processes, { objective });
  } catch {}
  const gateway = new Gateway(ctx);
  const server = await gateway.listen(argValue(args, '--host'), argValue(args, '--port'));
  const address = server.address();
  console.error(`green-roomz listening on http://${address.address}:${address.port}`);
  const nexus = ctx.registry.agents.get('tool-router-agent');
  if (nexus && ctx.registry.status(nexus.alias).state !== 'unavailable') {
    try {
      await ctx.processes.ensure(nexus);
      console.error(`pre-warmed ${nexus.alias} on ${nexus.backend_url ?? (':' + nexus.port)} (resident cpu kernel; specialists stay cold)`);
    } catch (error) {
      console.error(`nexus pre-warm failed: ${error.message}`);
    }
  }
  const shutdown = async () => {
    console.error('draining owned backends');
    server.close();
    await ctx.processes.stopAll();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

async function cmdDeploy(ctx, args) {
  const objective = POLICIES[ctx.manifest.gateway.policy]?.objective ?? 'throughput';
  try {
    await applyStoreWinners(ctx.processes, { objective });
  } catch {}
  await qualifyMissingAgents({
    manifest: ctx.manifest,
    registry: ctx.registry,
    hostAdapter: ctx.hostAdapter,
    processes: ctx.processes,
    objective,
    quick: hasFlag(args, '--quick'),
    force: false,
  });
  const deployed = [...ctx.processes.selectedProfiles.entries()].map(([alias, id]) => `${alias}=${id}`);
  console.error(`deployed ${deployed.join(' ') || '(none)'}`);
  return cmdServe(ctx, args);
}

async function main(argv) {
  const args = argv.slice(2);
  const command = args[0];
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    process.stdout.write(usage());
    return;
  }
  const ctx = await bootstrap(args);
  if (command === 'validate') return cmdValidate(ctx);
  if (command === 'doctor') return cmdDoctor(ctx);
  if (command === 'agents') return cmdAgents(ctx);
  if (command === 'fingerprint') return cmdFingerprint(ctx);
  if (command === 'benchmark') return cmdBenchmark(ctx, args);
  if (command === 'serve') return cmdServe(ctx, args);
  if (command === 'deploy') return cmdDeploy(ctx, args);
  if (command === 'stop') {
    await ctx.processes.stopAll();
    console.log(JSON.stringify({ stopped: true }));
    return;
  }
  throw new Error(`Unknown command: ${command}`);
}

main(process.argv).catch((error) => {
  console.error(error.message);
  process.exit(1);
});
