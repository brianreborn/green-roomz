#!/usr/bin/env node
/**
 * Rapid inner loop. Halt on the first unexpected FAIL.
 * Health status "degraded" is expected on the Windows MVP (missing specialists) — do not halt.
 * Health DOWN (no listener) does halt.
 *
 *   npm run iterate
 *   npm run iterate -- --live
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const argv = process.argv.slice(2);
const wantLive = argv.includes('--live');
const base = (process.env.GRZ_BASE_URL || 'http://127.0.0.1:8080').replace(/\/$/, '');

function halt(label, code = 1) {
  console.error(`HALT: ${label}`);
  process.exit(code);
}

function run(label, args) {
  console.error(`--- ${label} ---`);
  const result = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit', windowsHide: true });
  if (result.status !== 0) halt(`${label} failed (exit ${result.status ?? 'spawn'})`, result.status ?? 1);
}

async function health() {
  try {
    const res = await fetch(`${base}/health`, { signal: AbortSignal.timeout(3_000) });
    const json = await res.json().catch(() => null);
    return { up: res.ok, status: json?.status ?? null };
  } catch {
    return { up: false, status: null };
  }
}

if (wantLive) {
  const h = await health();
  if (!h.up) halt(`gateway DOWN at ${base}/health (not degraded — nothing is listening)`);
  if (h.status === 'degraded') {
    console.error('health=degraded (a health_aliases agent is unavailable; continuing iterate)');
  } else {
    console.error(`health=${h.status}`);
  }
}

run('unit', [
  '--test', '--test-concurrency=1',
  './test/dev-agent.test.mjs',
  './test/config.test.mjs',
  './test/routing.test.mjs',
  './test/gateway.test.mjs',
]);
run('e2e-smoke', ['./scripts/agent-e2e-eval.mjs']);
if (wantLive) run('e2e-live', ['./scripts/agent-e2e-eval.mjs', '--live-only']);
console.error('iterate: ok');
