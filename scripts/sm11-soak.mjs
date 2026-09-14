#!/usr/bin/env node
/**
 * Longer soak than sm11-load: many waves, mixed fat/thin payloads.
 * Asserts fail==0, serveAlive (GPU path), rising gpuOk / ring counters.
 * Prints one summary JSON object.
 *
 *   set GRZ_SM11=1
 *   node scripts/sm11-soak.mjs
 *   node scripts/sm11-soak.mjs --waves 40 --per-wave 64
 *   node scripts/sm11-soak.mjs --cpu
 */
import { Mailbox } from '../src/mailbox.mjs';
import { MonitorIpc } from '../src/monitor/ipc.mjs';
import { HOT_RING_SLOTS } from '../src/monitor/api.mjs';

function argVal(flag, fallback) {
  const i = process.argv.indexOf(flag);
  if (i < 0 || i + 1 >= process.argv.length) return fallback;
  return process.argv[i + 1];
}

function fail(where, extra = {}) {
  console.error(JSON.stringify({ ok: false, where, ...extra }, null, 2));
  process.exit(1);
}

const WAVES = Math.max(1, Number(argVal('--waves', 20)) || 20);
const PER_WAVE = Math.max(8, Number(argVal('--per-wave', 64)) || 64);
const PUSH_BUDGET_MS = Math.max(1, Number(argVal('--budget-ms', 15)) || 15);
const preferGpu = !process.argv.includes('--cpu');
if (!String(process.env.GRZ_SM11 ?? '').trim()) process.env.GRZ_SM11 = '1';

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
let fatPushes = 0;
let thinPushes = 0;
const waveSnap = [];
const tAll = performance.now();

for (let wave = 0; wave < WAVES; wave += 1) {
  for (let i = 0; i < PER_WAVE; i += 1) {
    // Mix: ~50% fat strings, ~50% thin objects; rotate pattern per wave.
    const fat = ((i + wave) % 2) === 0;
    const payload = fat
      ? `soak-w${wave}-i${i}-${'p'.repeat(300)}`
      : { soak: true, wave, i, thin: true };

    const t0 = performance.now();
    const pub = box.push({
      kind: 'success',
      source: 'sm11-soak',
      ticket: `b${wave}-${i}`,
      payload,
    });
    const dt = performance.now() - t0;
    if (dt > maxPushMs) maxPushMs = dt;
    if (!pub.ok) fail('mailbox.push', { pub, wave, i });
    if (dt >= PUSH_BUDGET_MS) {
      fail('mailbox.push', { blocked_ms: dt, budget_ms: PUSH_BUDGET_MS, wave, i });
    }

    const t1 = performance.now();
    const hop = ipc.push({
      kind: 'hop',
      source: 'sm11-soak',
      ticket: `i${wave}-${i}`,
      payload,
    });
    const dtIpc = performance.now() - t1;
    if (dtIpc > maxPushMs) maxPushMs = dtIpc;
    if (!hop.ok) fail('ipc.push', { hop, wave, i });
    if (dtIpc >= PUSH_BUDGET_MS) {
      fail('ipc.push', { blocked_ms: dtIpc, budget_ms: PUSH_BUDGET_MS, wave, i });
    }

    pushes += 2;
    if (fat) fatPushes += 2;
    else thinPushes += 2;
  }

  box.drain();
  ipc.drain();
  await box.sm11.flush();
  await ipc.sm11.flush();

  const bs = box.stats().sm11;
  const is = ipc.stats().sm11;
  waveSnap.push({
    wave,
    mailbox: {
      fail: bs.fail,
      gpuOk: bs.gpuOk,
      ringPush: bs.ringPush,
      ringDrain: bs.ringDrain,
      ringScrub: bs.ringScrub,
      serveAlive: bs.serveAlive,
    },
    ipc: {
      fail: is.fail,
      gpuOk: is.gpuOk,
      ringPush: is.ringPush,
      ringDrain: is.ringDrain,
      ringScrub: is.ringScrub,
      serveAlive: is.serveAlive,
    },
  });

  if ((bs.fail ?? 0) !== 0) fail('mailbox.fail_mid', { wave, mailbox: bs });
  if ((is.fail ?? 0) !== 0) fail('ipc.fail_mid', { wave, ipc: is });
}

const elapsed = performance.now() - tAll;
const bs = box.stats().sm11;
const is = ipc.stats().sm11;

const report = {
  ok: true,
  mode: 'soak',
  grz_sm11: process.env.GRZ_SM11,
  preferGpu,
  serve: { mailbox: box.sm11?.serve ?? false, ipc: ipc.sm11?.serve ?? false },
  waves: WAVES,
  per_wave: PER_WAVE,
  pushes,
  fat_pushes: fatPushes,
  thin_pushes: thinPushes,
  hot_ring_slots: HOT_RING_SLOTS,
  max_push_ms: Number(maxPushMs.toFixed(3)),
  elapsed_ms: Number(elapsed.toFixed(3)),
  mailbox: bs,
  ipc: is,
  wave_end: waveSnap[waveSnap.length - 1] ?? null,
};

for (const [side, s] of [['mailbox', bs], ['ipc', is]]) {
  if ((s?.fail ?? 0) !== 0) {
    fail(`${side}.fail`, { got: s.fail, failByKind: s.failByKind, report });
  }
  if ((s?.fat ?? 0) < Math.floor(fatPushes / 2)) {
    fail(`${side}.fat`, { got: s?.fat, need: Math.floor(fatPushes / 2), report });
  }
  if ((s?.verify ?? 0) < 1) {
    fail(`${side}.verify`, { got: s?.verify, report });
  }
  if ((s?.coalesced ?? 0) < 1) {
    fail(`${side}.coalesced`, { report });
  }

  const ringOk = (s?.ringPush ?? 0) >= 1
    && (s?.ringDrain ?? 0) >= 1
    && (s?.ringScrub ?? 0) >= 1;
  const probeOk = (s?.seq ?? 0) >= 1
    && (s?.scrub ?? 0) >= 1
    && (s?.batch ?? 0) >= 1;
  if (!ringOk && !probeOk) {
    fail(`${side}.hot_path`, {
      need_ring: { ringPush: 1, ringDrain: 1, ringScrub: 1 },
      need_probe: { seq: 1, scrub: 1, batch: 1 },
      got: {
        ringPush: s?.ringPush ?? 0,
        ringDrain: s?.ringDrain ?? 0,
        ringScrub: s?.ringScrub ?? 0,
        seq: s?.seq ?? 0,
        scrub: s?.scrub ?? 0,
        batch: s?.batch ?? 0,
      },
      report,
    });
  }

  if (preferGpu) {
    if (!s?.serveAlive) {
      fail(`${side}.serveAlive`, { got: s?.serveAlive, report });
    }
    if ((s?.gpuOk ?? 0) < WAVES) {
      fail(`${side}.gpuOk`, { got: s?.gpuOk, need: WAVES, report });
    }
    // gpuOk must rise across waves (first snap vs last).
    const first = waveSnap[0]?.[side]?.gpuOk ?? 0;
    const last = waveSnap[waveSnap.length - 1]?.[side]?.gpuOk ?? 0;
    if (!(last > first)) {
      fail(`${side}.gpuOk_rises`, { first, last, report });
    }
  }
}

if (box.sm11?.close) await box.sm11.close();
if (ipc.sm11?.close) await ipc.sm11.close();

console.log(JSON.stringify(report, null, 2));
process.exit(0);
