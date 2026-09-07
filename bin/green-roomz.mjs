#!/usr/bin/env node
import { loadManifest, loadDeclaredKernel } from '../src/config.mjs';
import { compileManifestPrompts, compileStockPrompt, stockPromptLayers, sha256 } from '../src/compile-prompt.mjs';
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
  prime [--manifest path] [--only a,b]  (snapshot each agent's stock-prompt KV as "default")
  serve [--manifest path] [--host address] [--port number]
  deploy [--manifest path] [--host address] [--port number] [--quick] [--prime]
  benchmark [alias|all] [--manifest path] [--quick] [--force]
  fingerprint [--manifest path]
  doctor [--manifest path]
  agents [--manifest path]
  agent --goal TEXT [--workspace dir] [--offline] [--lang py] [--max-steps N]
                           [--max-tokens N] [--timeout-ms N] [--manifest path]
                           (write/run/test loop; language from goal/extension; learns runtimes as it goes.
                            live max_tokens/timeout come from gateway.agent_max_tokens and
                            gateway.agent_chat_timeout_ms unless the flags are set)
  stop [--manifest path]   (SIGTERM gateway from data/serve.pid; reap owned children.json PIDs)
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
  const objective = POLICIES[manifest.gateway.policy]?.objective ?? 'interactive';
  if (manifest.gateway.apply_store_winners === true) {
    try {
      await applyStoreWinners(processes, { objective });
    } catch {}
  }
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
  const packRoot = ctx.manifest._meta?.packageRoot ?? process.env.GRZ_ROOT ?? process.cwd();
  attachServeConsole({ root: packRoot });
  ctx.processes.packRoot = packRoot;
  ctx.processes.dataDir = (await import('node:path')).default.join(packRoot, 'data');
  ctx.processes.writeServePid(process.pid);
  if (ctx.manifest.gateway.apply_store_winners === true) {
    const objective = POLICIES[ctx.manifest.gateway.policy]?.objective ?? 'interactive';
    try {
      await applyStoreWinners(ctx.processes, { objective });
    } catch {}
  }
  const gateway = new Gateway(ctx);
  // A cold start restores its `default` prime snapshot when it still matches the
  // live compiled stock prompt — model wakes holding its system prompt.
  ctx.processes.stockPromptSha = stockPromptShaResolver(ctx);
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
      console.error(`pre-warmed ${nexus.alias} on :${nexus.port} (resident cpu kernel)`);
    } catch (error) {
      console.error(`nexus pre-warm failed: ${error.message}`);
    }
  }
  const chatAgent = ctx.registry.agents.get('general-text-speculator');
  if (chatAgent && ctx.registry.status(chatAgent.alias).state !== 'unavailable') {
    try {
      await ctx.processes.ensure(chatAgent);
      console.error(`pre-warmed ${chatAgent.alias} on :${chatAgent.port} (pinned chat; generic clients skip mmap)`);
      try {
        await fetch(`http://127.0.0.1:${chatAgent.port}/v1/chat/completions`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            model: chatAgent.alias,
            messages: [{ role: 'user', content: '.' }],
            max_tokens: 1,
            stream: false,
          }),
          signal: AbortSignal.timeout(60_000),
        });
        console.error(`primed ${chatAgent.alias} (1 token; first client turn should stay under a minute)`);
      } catch (error) {
        console.error(`chat prime failed: ${error.message}`);
      }
    } catch (error) {
      console.error(`chat pre-warm failed: ${error.message}`);
    }
  }
  let shuttingDown = false;
  const shutdown = async (code = 0) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.error('draining owned backends');
    server.close();
    try { await ctx.processes.stopAll(); } catch (error) { console.error(`stopAll failed: ${error?.message}`); }
    try { ctx.processes.clearServePid(); } catch {}
    process.exit(code);
  };
  process.on('SIGINT', () => shutdown(0));
  process.on('SIGTERM', () => shutdown(0));
  // PF7: SIGHUP must drain the same way as SIGTERM (POSIX). Win32: Ctrl-C is SIGINT;
  // closing the console is CTRL_CLOSE_EVENT (Node may not map it to SIGTERM).
  if (process.platform !== 'win32') {
    process.on('SIGHUP', () => shutdown(0));
  }

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

function stockPromptShaResolver(ctx) {
  return (alias) => {
    const agent = ctx.registry.agents.get(alias) ?? ctx.manifest.agents.find((a) => a.alias === alias);
    if (!agent) return null;
    const kernelText = loadDeclaredKernel(agent);
    if (!kernelText) return null;
    try { return sha256(compileStockPrompt(agent, { kernelText })); } catch { return null; }
  };
}

async function cmdPrime(ctx, args) {
  if (!ctx.processes.checkpointDir) {
    console.error('prime needs a checkpoint dir — set gateway.checkpoint_dir or GREEN_ROOMZ_CHECKPOINT_DIR');
    process.exitCode = 1;
    return;
  }
  const only = argValue(args, '--only');
  const onlySet = only ? new Set(only.split(',').map((s) => s.trim())) : null;
  const targets = ctx.manifest.agents.filter((a) =>
    a.runtime === 'llama_server' && !a.variant_of && loadDeclaredKernel(a)
    && (!onlySet || onlySet.has(a.alias)));
  if (!targets.length) {
    console.error(onlySet ? `no primeable llama_server agents match --only ${only}` : 'no primeable llama_server agents');
    return;
  }
  for (const agent of targets) {
    const prompt = compileStockPrompt(agent, { kernelText: loadDeclaredKernel(agent) });
    try {
      await ctx.processes.ensure(agent);
      const res = await fetch(`http://127.0.0.1:${agent.port}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: agent.alias,
          messages: [{ role: 'system', content: prompt }, { role: 'user', content: '.' }],
          max_tokens: 1,
          temperature: 0,
          stream: false,
          cache_prompt: true,
        }),
        signal: AbortSignal.timeout(120_000),
      });
      await res.text();
      const snap = await ctx.processes.snapshotModel(agent.alias, 'default', {
        prime: { promptSha: sha256(prompt), bytes: Buffer.byteLength(prompt, 'utf8'), at: new Date().toISOString() },
      });
      console.error(snap?.state
        ? `primed ${agent.alias} -> ${agent.alias.replace(/[^a-z0-9-]/gi, '_')}/${snap.state} (prompt ${sha256(prompt).slice(0, 12)})`
        : `prime ${agent.alias}: snapshot failed (checkpoint save returned no file)`);
    } catch (error) {
      console.error(`prime ${agent.alias}: ${error.message}`);
    } finally {
      await ctx.processes.stop(agent.alias, { checkpoint: false }).catch(() => {});
    }
  }
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
  await cmdCompile(ctx, []); // ship fresh build/prompts/
  if (hasFlag(args, '--prime')) {
    if (ctx.processes.checkpointDir) await cmdPrime(ctx, []); // default-installation checkpoints
    else console.error('deploy --prime: no checkpoint dir configured, skipping prime');
  }
  return cmdServe(ctx, args);
}

async function cmdStopFromPidfile(ctx) {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const packRoot = ctx.manifest._meta?.packageRoot ?? process.env.GRZ_ROOT ?? process.cwd();
  const dataDir = path.join(packRoot, 'data');
  const pidFile = path.join(dataDir, 'serve.pid');
  const childrenFile = path.join(dataDir, 'children.json');
  if (!fs.existsSync(pidFile)) {
    return { ok: false, stopped: false, error: 'no serve pidfile', path: pidFile };
  }
  let gatewayPid;
  try {
    gatewayPid = Number(String(fs.readFileSync(pidFile, 'utf8')).trim());
  } catch {
    return { ok: false, stopped: false, error: 'unreadable serve pidfile', path: pidFile };
  }
  if (!Number.isFinite(gatewayPid) || gatewayPid <= 0) {
    return { ok: false, stopped: false, error: 'invalid serve pidfile', path: pidFile };
  }
  const childRows = [];
  if (fs.existsSync(childrenFile)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(childrenFile, 'utf8'));
      if (Array.isArray(parsed)) childRows.push(...parsed);
    } catch {}
  }
  // SIGTERM gateway so in-process drain (stopAll) runs when possible.
  try { process.kill(gatewayPid, 'SIGTERM'); } catch (error) {
    if (error?.code !== 'ESRCH') {
      return { ok: false, stopped: false, error: `kill gateway ${gatewayPid}: ${error.message}` };
    }
  }
  // Wait briefly for gateway exit, then reap remaining child PIDs by PID (never by image name).
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try { process.kill(gatewayPid, 0); await new Promise((r) => setTimeout(r, 200)); }
    catch { break; }
  }
  const reaped = [];
  for (const row of childRows) {
    const pid = Number(row?.pid);
    if (!Number.isFinite(pid) || pid <= 0 || pid === gatewayPid) continue;
    try {
      process.kill(pid, 'SIGTERM');
      reaped.push(pid);
    } catch {}
  }
  await new Promise((r) => setTimeout(r, 1000));
  for (const pid of reaped) {
    try { process.kill(pid, 'SIGKILL'); } catch {}
  }
  try { fs.unlinkSync(pidFile); } catch {}
  try { fs.unlinkSync(childrenFile); } catch {}
  return { ok: true, stopped: true, gatewayPid, reaped };
}

async function cmdAgent(args) {
  const { runDevAgent, gatewayChat } = await import('../src/dev-agent.mjs');
  const { loadManifest } = await import('../src/config.mjs');
  const pathMod = await import('node:path');
  const goal = argValue(args, '--goal');
  if (!goal) {
    console.error('agent --goal "write a python function add(a,b) with a test and run it" [--offline] [--lang py] [--max-tokens N] [--timeout-ms N]');
    process.exitCode = 1;
    return;
  }
  const workspace = argValue(args, '--workspace') || pathMod.join(process.cwd(), 'data', 'agent-ws');
  const base = process.env.GRZ_BASE_URL || 'http://127.0.0.1:8080';
  const offline = hasFlag(args, '--offline');
  const maxSteps = Number(argValue(args, '--max-steps', '12'));
  const manifest = await loadManifest(argValue(args, '--manifest'));
  const timeoutFlag = argValue(args, '--timeout-ms');
  const maxTokensFlag = argValue(args, '--max-tokens');
  const timeoutMs = timeoutFlag != null ? Number(timeoutFlag) : Number(manifest.gateway.agent_chat_timeout_ms);
  const maxTokens = maxTokensFlag != null ? Number(maxTokensFlag) : Number(manifest.gateway.agent_max_tokens);
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1) {
    console.error('agent: gateway.agent_chat_timeout_ms or --timeout-ms must be a positive integer');
    process.exitCode = 1;
    return;
  }
  if (!Number.isFinite(maxTokens) || maxTokens < 1) {
    console.error('agent: gateway.agent_max_tokens or --max-tokens must be a positive integer');
    process.exitCode = 1;
    return;
  }
  const chat = offline ? undefined : (body) => gatewayChat(base, body, { timeoutMs });
  const result = await runDevAgent({
    workspace,
    goal,
    chat,
    model: argValue(args, '--model') || 'general-text-speculator',
    lang: argValue(args, '--lang'),
    maxSteps: Number.isFinite(maxSteps) && maxSteps > 0 ? maxSteps : 12,
    maxTokens,
  });
  console.log(JSON.stringify({
    ok: result.ok,
    summary: result.summary,
    stdout: result.stdout,
    lang: result.lang,
    learned: result.learned,
    stats: result.stats,
    workspace,
    steps: result.steps.length,
  }, null, 2));
  if (!result.ok) process.exitCode = 1;
}

async function main(argv) {
  const args = argv.slice(2);
  const command = args[0];
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    process.stdout.write(usage());
    return;
  }
  if (command === 'agent') return cmdAgent(args);
  if (command === 'stop') {
    // Lightweight: load manifest for packRoot only; do not claim stopAll on an empty ProcessManager.
    const { loadManifest } = await import('../src/config.mjs');
    const manifestPath = argValue(args, '--manifest');
    const manifest = await loadManifest(manifestPath);
    const result = await cmdStopFromPidfile({ manifest, processes: null });
    console.log(JSON.stringify(result));
    if (!result.ok) process.exitCode = 1;
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
  if (command === 'prime') return cmdPrime(ctx, args);
  if (command === 'serve') return cmdServe(ctx, args);
  if (command === 'deploy') return cmdDeploy(ctx, args);
  // stop handled before bootstrap (PF1)

  throw new Error(`Unknown command: ${command}`);
}

main(process.argv).catch((error) => {
  console.error(error.message);
  process.exit(1);
});
