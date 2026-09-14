#!/usr/bin/env node
/**
 * Hammer Mailbox + MonitorIpc pushes (fat + thin) with sm11 assists enabled.
 * Asserts push never blocks, flushes pending assists, prints rising counters.
 *
 *   set GRZ_SM11=1
 *   node scripts/sm11-load.mjs
 *   node scripts/sm11-load.mjs --waves 5 --per-wave 128 --cpu
 */
import { Mailbox } from '../src/mailbox.mjs';
import { MonitorIpc } from '../src/monitor/ipc.mjs';
import { HOT_RING_SLOTS } from '../src/monitor/api.mjs';

function argVal(flag, fallback) {
  const i = process.argv.indexOf(flag);
  if (i < 0 || i + 1 >= process.argv.length) return fallback;
  return process.argv[i + 1];
}

const WAVES = Math.max(1, Number(argVal('--waves', 3)) || 3);
const PER_WAVE = Math.max(8, Number(argVal('--per-wave', 64)) || 64);
const PUSH_BUDGET_MS = Math.max(1, Number(argVal('--budget-ms', 10)) || 10);
const preferGpu = !process.argv.includes('--cpu');
const envOn = String(process.env.GRZ_SM11 ?? '').trim();
if (!envOn) process.env.GRZ_SM11 = '1';

const sm11Opts = {
  verifyOnFat: true,
  hotPath: true,
  preferGpu,
  hotBatch: 4,
  hotEnvBytes: 16,
  serve: preferGpu,
};

const box = new Mailbox({
  capacity: 8,
  autoDrain: false,
  sm11: sm11Opts,
});
const ipc = new MonitorIpc({
  autoDrain: false,
  sm11: sm11Opts,
});

let maxPushMs = 0;
let pushes = 0;
const tAll = performance.now();

for (let wave = 0; wave < WAVES; wave += 1) {
  for (let i = 0; i < PER_WAVE; i += 1) {
    const fat = i % 2 === 0;
    const payload = fat ? `w${wave}-${i}-${'p'.repeat(300)}` : { wave, i, thin: true };

    const t0 = performance.now();
    const pub = box.push({ kind: 'success', source: 'sm11-load', ticket: `b${wave}-${i}`, payload });
    const dt = performance.now() - t0;
    if (dt > maxPushMs) maxPushMs = dt;
    if (!pub.ok) {
      console.error(JSON.stringify({ ok: false, where: 'mailbox.push', pub }));
      process.exit(1);
    }
    if (dt >= PUSH_BUDGET_MS) {
      console.error(JSON.stringify({ ok: false, where: 'mailbox.push', blocked_ms: dt, budget_ms: PUSH_BUDGET_MS }));
      process.exit(1);
    }

    const t1 = performance.now();
    const hop = ipc.push({ kind: 'hop', source: 'sm11-load', ticket: `i${wave}-${i}`, payload });
    const dtIpc = performance.now() - t1;
    if (dtIpc > maxPushMs) maxPushMs = dtIpc;
    if (!hop.ok) {
      console.error(JSON.stringify({ ok: false, where: 'ipc.push', hop }));
      process.exit(1);
    }
    if (dtIpc >= PUSH_BUDGET_MS) {
      console.error(JSON.stringify({ ok: false, where: 'ipc.push', blocked_ms: dtIpc, budget_ms: PUSH_BUDGET_MS }));
      process.exit(1);
    }
    pushes += 2;
  }
  box.drain();
  ipc.drain();
  await box.sm11.flush();
  await ipc.sm11.flush();
}

const elapsed = performance.now() - tAll;
const bs = box.stats().sm11;
const is = ipc.stats().sm11;

const report = {
  ok: true,
  grz_sm11: process.env.GRZ_SM11,
  preferGpu,
  serve: { mailbox: box.sm11?.serve ?? false, ipc: ipc.sm11?.serve ?? false },
  waves: WAVES,
  per_wave: PER_WAVE,
  pushes,
  hot_ring_slots: HOT_RING_SLOTS,
  max_push_ms: Number(maxPushMs.toFixed(3)),
  elapsed_ms: Number(elapsed.toFixed(3)),
  mailbox: bs,
  ipc: is,
};

const need = {
  fat: WAVES * Math.floor(PER_WAVE / 2),
  verify: WAVES,
  seq: WAVES,
  scrub: 1,
  batch: WAVES,
};

for (const [side, s] of [['mailbox', bs], ['ipc', is]]) {
  for (const [k, min] of Object.entries(need)) {
    if (!s || (s[k] ?? 0) < min) {
      console.error(JSON.stringify({
        ok: false,
        where: `${side}.${k}`,
        got: s?.[k] ?? null,
        need: min,
        report,
      }, null, 2));
      process.exit(1);
    }
  }
  if ((s.coalesced ?? 0) < 1) {
    console.error(JSON.stringify({ ok: false, where: `${side}.coalesced`, report }, null, 2));
    process.exit(1);
  }
}

if (box.sm11?.close) await box.sm11.close();
if (ipc.sm11?.close) await ipc.sm11.close();

console.log(JSON.stringify(report, null, 2));
process.exit(0);
