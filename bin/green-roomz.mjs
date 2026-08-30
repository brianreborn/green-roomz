#!/usr/bin/env node
import { loadManifest, loadDeclaredKernel } from '../src/config.mjs';
import { compileManifestPrompts, stockPromptLayers } from '../src/compile-prompt.mjs';
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
  compile [--manifest path] [--check]   (write build/prompts/ stock system prompts)
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
  // Launch harness may inject trusted peer IPs (e.g. deploy/adb-peer.mjs resolves
  // the one adb-attached Android device's shared-subnet IP). Repeatable.
  const injectedPeers = args.reduce((acc, a, i) => (a === '--allow-peer' && args[i + 1] ? [...acc, args[i + 1]] : acc), []);
  if (injectedPeers.length) console.error(`allow-peer: ${gateway.addPeers(injectedPeers).join(', ')}`);
  const server = await gateway.listen(argValue(args, '--host'), argValue(args, '--port'));
  const address = server.address();
  console.error(`green-roomz listening on http://${address.address}:${address.port}`);
  ctx.processes.startIdleSweeper();
  const nexus = ctx.registry.agents.get('tool-router-agent');
  if (nexus && ctx.registry.status(nexus.alias).state !== 'unavailable') {
    try {
      await ctx.processes.ensure(nexus);
      console.error(`pre-warmed ${nexus.alias} on :${nexus.port} (resident cpu kernel; specialists stay cold)`);
    } catch (error) {
      console.error(`nexus pre-warm failed: ${error.message}`);
    }
  }
  let shuttingDown = false;
  const shutdown = async (code = 0) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.error('draining owned backends');
    server.close();
    try { await ctx.processes.stopAll(); } catch (error) { console.error(`stopAll failed: ${error?.message}`); }
    process.exit(code);
  };
  process.on('SIGINT', () => shutdown(0));
  process.on('SIGTERM', () => shutdown(0));

  // A stray rejection in a request path must not kill the gateway.
  process.on('unhandledRejection', (reason) => {
    console.error(`unhandledRejection (continuing): ${reason instanceof Error ? reason.stack : reason}`);
  });
  // An uncaught exception may mean corrupt state: log, drain, let the supervisor restart.
  process.on('uncaughtException', (error) => {
    console.error(`uncaughtException: ${error?.stack ?? error}`);
    shutdown(1);
    setTimeout(() => process.exit(1), 2000).unref();
  });
}

async function cmdCouncilStats(ctx, args) {
  const { readFileSync, existsSync } = await import('node:fs');
  const path = await import('node:path');
  const dir = ctx.manifest.gateway?.council_dir ?? process.env.GREEN_ROOMZ_COUNCIL_DIR;
  const file = dir && path.join(dir, 'scores.jsonl');
  if (!file || !existsSync(file)) { console.error(`no council scorecard (set gateway.council_dir; expected ${file ?? '<unset>'})`); return; }
  const rows = readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const taskFilter = args.find((a) => !a.startsWith('--') && a !== 'council-stats');
  const scoped = taskFilter ? rows.filter((r) => r.task === taskFilter) : rows;

  const per = {};
  for (const r of scoped) {
    for (const v of r.results) {
      const s = (per[v.alias] ??= { runs: 0, winner: 0, outlier: 0, agreed: 0, failed: 0, ms: 0 });
      s.runs += 1; s[v.verdict] += 1; s.ms += v.ms || 0;
    }
  }
  const table = Object.entries(per).map(([alias, s]) => ({
    alias,
    runs: s.runs,
    win_rate: +(s.winner / s.runs).toFixed(2),
    agree_rate: +((s.winner + s.agreed) / s.runs).toFixed(2),
    outlier_rate: +(s.outlier / s.runs).toFixed(2),
    fail_rate: +(s.failed / s.runs).toFixed(2),
    avg_ms: Math.round(s.ms / s.runs),
  })).sort((a, b) => b.agree_rate - a.agree_rate);

  if (args.includes('--json')) { console.log(JSON.stringify({ rows: scoped.length, per: table }, null, 2)); return; }
  console.log(`council scorecard${taskFilter ? ` [${taskFilter}]` : ''} - ${scoped.length} runs\n`);
  for (const t of table) {
    console.log(`  ${t.alias.padEnd(32)} win ${String(t.win_rate).padStart(4)}  agree ${String(t.agree_rate).padStart(4)}  outlier ${String(t.outlier_rate).padStart(4)}  fail ${String(t.fail_rate).padStart(4)}  ${String(t.avg_ms).padStart(6)}ms`);
  }
  const top = table[0];
  if (top && scoped.length >= 20) console.log(`\nsuggested default_variant: ${top.alias} (agree ${top.agree_rate}, outlier ${top.outlier_rate} over ${top.runs} runs)`);
}

async function cmdCompile(ctx, args) {
  const { writeFileSync, mkdirSync, existsSync, readFileSync } = await import('node:fs');
  const pathMod = await import('node:path');
  const check = hasFlag(args, '--check');
  const outDir = pathMod.join(process.cwd(), 'build', 'prompts');
  const { prompts, index } = compileManifestPrompts(ctx.manifest, loadDeclaredKernel);

  const stale = [];
  const readLf = (file) => (existsSync(file) ? readFileSync(file, 'utf8').replace(/\r\n/g, '\n') : null);
  if (!check) mkdirSync(outDir, { recursive: true });
  for (const [alias, text] of prompts) {
    const file = pathMod.join(outDir, `${alias}.md`);
    if (readLf(file) === text) continue;
    if (check) { stale.push(alias); continue; }
    writeFileSync(file, text);
  }
  const indexFile = pathMod.join(outDir, 'index.json');
  const indexText = `${JSON.stringify(index, null, 2)}\n`;
  if (readLf(indexFile) !== indexText) {
    if (check) stale.push('index.json');
    else writeFileSync(indexFile, indexText);
  }

  if (check) {
    if (stale.length) {
      console.error(`stale compiled prompts: ${stale.join(', ')} — run \`green-roomz compile\``);
      process.exitCode = 1;
      return;
    }
    console.error(`build/prompts up to date (${prompts.size} agents)`);
    return;
  }
  for (const [alias, meta] of Object.entries(index.agents)) {
    const layers = stockPromptLayers(alias);
    console.error(`  ${alias.padEnd(28)} ${String(meta.bytes).padStart(5)}b  [${layers.join(' + ') || 'kernel only'}]`);
  }
  console.error(`wrote build/prompts/ (${prompts.size} agents + index.json)`);
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
  if (command === 'council-stats') return cmdCouncilStats(ctx, args);
  if (command === 'compile') return cmdCompile(ctx, args);
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
