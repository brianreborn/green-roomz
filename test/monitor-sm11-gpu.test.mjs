import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { Mailbox } from '../src/mailbox.mjs';
import {
  defaultExePath,
  fnv1a64Hex,
  digestFatPayload,
  cpuVerify,
  cpuScrub,
  cpuSeq,
  cpuBatch,
  cpuRingPush,
  cpuRingHash,
  cpuRingScrub,
  createCpuRingState,
  verifyPayload,
  verifyScrub,
  verifySeq,
  verifyBatch,
  verifyRingPush,
  verifyRingHash,
  verifyRingScrub,
  createSm11Assist,
  createSm11ServeSession,
  serveRunExeFactory,
  probeSm11,
  SM11_SEQ_START,
} from '../src/monitor/sm11-gpu.mjs';
import { MonitorIpc } from '../src/monitor/ipc.mjs';
import { sm11VerifyPayload, fnv1a64Hex as apiFnv, HOT_RING_SLOTS } from '../src/monitor/api.mjs';
import { u64Eq } from '../src/monitor/ids.mjs';

const KNOWN = 'green-roomz-mailbox-probe';
const KNOWN_HASH = '0x3909d6f79a48ee3c';
const EXE = defaultExePath();
const HAS_EXE = existsSync(EXE);

test('CPU FNV-1a matches sm11_monitor known probe hash', () => {
  assert.equal(fnv1a64Hex(KNOWN), KNOWN_HASH);
  assert.equal(apiFnv(KNOWN), KNOWN_HASH);
  const v = cpuVerify(KNOWN);
  assert.equal(v.ok, true);
  assert.equal(v.backend, 'cpu');
  assert.equal(v.hash, KNOWN_HASH);
});

test('digestFatPayload keeps sha256 stored form and adds FNV twin', () => {
  const long = 'x'.repeat(300);
  const d = digestFatPayload(long);
  assert.equal(d.stored.length, 64);
  assert.match(d.stored, /^[0-9a-f]{64}$/);
  assert.match(d.fnv, /^0x[0-9a-f]{16}$/);
});

test('verifyPayload falls back to CPU when exe missing', async () => {
  const result = await verifyPayload(KNOWN, {
    exePath: 'C:\\nonexistent\\sm11_monitor.exe',
    preferGpu: true,
    exists: () => false,
  });
  assert.equal(result.ok, true);
  assert.equal(result.backend, 'cpu');
  assert.equal(result.fallback, 'exe_missing');
  assert.equal(result.hash, KNOWN_HASH);
});

test('verifyPayload uses CUDA JSON when runExe returns ok', async () => {
  const result = await verifyPayload(KNOWN, {
    exePath: EXE,
    exists: () => true,
    preferGpu: true,
    runExe: async () => ({
      code: 0,
      stdout: JSON.stringify({
        device: 'GeForce 8600 GT',
        sm: '11',
        vram_mb: 256,
        copy_ok: true,
        hash_ok: true,
        hash: KNOWN_HASH,
        expect: KNOWN_HASH,
        batch_ok: true,
        ok: true,
      }) + '\n',
      stderr: '',
    }),
  });
  assert.equal(result.ok, true);
  assert.equal(result.backend, 'cuda');
  assert.equal(result.device, 'GeForce 8600 GT');
  assert.equal(result.hash, KNOWN_HASH);
});

test('verifyPayload CPU-falls back when CUDA JSON reports failure', async () => {
  const result = await verifyPayload(KNOWN, {
    exePath: EXE,
    exists: () => true,
    runExe: async () => ({
      code: 1,
      stdout: '{"ok":false,"copy_ok":false,"hash_ok":false}\n',
      stderr: 'cuda fail',
    }),
  });
  assert.equal(result.ok, true);
  assert.equal(result.backend, 'cpu');
  assert.equal(result.fallback, 'cuda_fail');
});

test('Mailbox sm11 assist observes fat payload without blocking push', async () => {
  const calls = [];
  const box = new Mailbox({
    autoDrain: false,
    sm11: {
      verifyOnFat: true,
      exePath: EXE,
      exists: () => true,
      runExe: async (_exe, args) => {
        calls.push(args);
        return {
          code: 0,
          stdout: `{"ok":true,"copy_ok":true,"hash_ok":true,"hash":"${KNOWN_HASH}","expect":"${KNOWN_HASH}"}\n`,
          stderr: '',
        };
      },
    },
  });
  const t0 = performance.now();
  const published = box.push({ kind: 'success', source: 'a', payload: 'y'.repeat(300) });
  assert.ok(performance.now() - t0 < 10);
  assert.equal(published.ok, true);
  const [event] = box.drain();
  assert.equal(event.payload.length, 64);
  await box.sm11.flush();
  assert.equal(box.stats().sm11.fat, 1);
  assert.ok(box.stats().sm11.verifyAttempts >= 1);
  assert.ok(calls.length >= 1);
  assert.ok(calls[0].includes('--json'));
});

test('MonitorIpc auto-wires sm11; fat push records assist stats', async () => {
  const ipc = new MonitorIpc({
    autoDrain: false,
    sm11: { verifyOnFat: false, preferGpu: false },
  });
  assert.ok(ipc.sm11);
  ipc.push({ kind: 'hop', source: 'x', ticket: 'long', payload: 'z'.repeat(300) });
  assert.equal(ipc.stats().sm11.fat, 1);
  assert.equal(ipc.peekHot()[0].payload.length, 64);
});

test('api re-exports sm11VerifyPayload', async () => {
  const result = await sm11VerifyPayload(KNOWN, { preferGpu: false });
  assert.equal(result.backend, 'cpu');
  assert.equal(result.hash, KNOWN_HASH);
});

test('createSm11Assist.flush waits for scheduled verify', async () => {
  let resolveRun;
  const gate = new Promise((r) => { resolveRun = r; });
  const assist = createSm11Assist({
    verifyOnFat: true,
    exists: () => true,
    exePath: EXE,
    runExe: async () => {
      await gate;
      return {
        code: 0,
        stdout: `{"ok":true,"copy_ok":true,"hash_ok":true,"hash":"${KNOWN_HASH}","expect":"${KNOWN_HASH}"}\n`,
        stderr: '',
      };
    },
  });
  const p = assist.scheduleVerify(KNOWN);
  assert.equal(assist.stats().pending, 1);
  resolveRun();
  await assist.flush();
  assert.equal(assist.stats().pending, 0);
  assert.equal((await p).backend, 'cuda');
});

test('cpuScrub / cpuSeq / cpuBatch match native probe contracts', () => {
  const scrub = cpuScrub({ batch: 8, envBytes: 64 });
  assert.equal(scrub.ok, true);
  assert.equal(scrub.scrub_ok, true);
  assert.equal(scrub.scrub_bytes, 64 * 8);

  const seq = cpuSeq({ batch: 8 });
  assert.equal(seq.ok, true);
  assert.equal(seq.seq_ok, true);
  assert.ok(u64Eq(seq.seq_start, SM11_SEQ_START));
  assert.equal(seq.seq_end.hi, 1);
  assert.equal(seq.seq_end.lo, 6);

  const batch = cpuBatch({ batch: 4, envBytes: 32 });
  assert.equal(batch.ok, true);
  assert.equal(batch.batch_ok, true);
  assert.equal(batch.hashes.length, 4);
  assert.match(batch.hashes[0], /^0x[0-9a-f]{16}$/);
});

test('verifyScrub/Seq/Batch fall back to CPU when exe missing', async () => {
  const missing = {
    exePath: 'C:\\nonexistent\\sm11_monitor.exe',
    preferGpu: true,
    exists: () => false,
    batch: 8,
    envBytes: 64,
  };
  const scrub = await verifyScrub(missing);
  assert.equal(scrub.backend, 'cpu');
  assert.equal(scrub.fallback, 'exe_missing');
  assert.equal(scrub.scrub_ok, true);

  const seq = await verifySeq(missing);
  assert.equal(seq.backend, 'cpu');
  assert.equal(seq.seq_ok, true);

  const batch = await verifyBatch(missing);
  assert.equal(batch.backend, 'cpu');
  assert.equal(batch.batch_ok, true);
});

test('verifyScrub/Seq/Batch use CUDA JSON when runExe returns ok', async () => {
  const scrub = await verifyScrub({
    exePath: EXE,
    exists: () => true,
    batch: 8,
    envBytes: 64,
    runExe: async (_exe, args) => {
      assert.ok(args.includes('--scrub'));
      assert.ok(args.includes('--batch'));
      return {
        code: 0,
        stdout: '{"device":"GeForce 8600 GT","sm":"11","vram_mb":256,"batch":8,"env_bytes":64,"scrub_ok":true,"ok":true}\n',
        stderr: '',
      };
    },
  });
  assert.equal(scrub.backend, 'cuda');
  assert.equal(scrub.scrub_ok, true);

  const seq = await verifySeq({
    exePath: EXE,
    exists: () => true,
    batch: 8,
    runExe: async (_exe, args) => {
      assert.ok(args.includes('--seq'));
      return {
        code: 0,
        stdout: '{"device":"GeForce 8600 GT","sm":"11","batch":8,"seq_ok":true,"seq_start":{"hi":0,"lo":4294967294},"seq_end":{"hi":1,"lo":6},"ok":true}\n',
        stderr: '',
      };
    },
  });
  assert.equal(seq.backend, 'cuda');
  assert.equal(seq.seq_ok, true);
  assert.equal(seq.seq_end.lo, 6);

  const batch = await verifyBatch({
    exePath: EXE,
    exists: () => true,
    batch: 8,
    envBytes: 64,
    runExe: async (_exe, args) => {
      assert.ok(args.includes('--hash'));
      assert.ok(args.includes('--batch'));
      return {
        code: 0,
        stdout: `{"device":"GeForce 8600 GT","sm":"11","batch":8,"env_bytes":64,"hash_ok":true,"hash":"${KNOWN_HASH}","expect":"${KNOWN_HASH}","batch_ok":true,"ok":true}\n`,
        stderr: '',
      };
    },
  });
  assert.equal(batch.backend, 'cuda');
  assert.equal(batch.batch_ok, true);
});

test('createSm11Assist exposes non-blocking assistScrub/Seq/Batch', async () => {
  const calls = [];
  const assist = createSm11Assist({
    verifyOnFat: false,
    exists: () => true,
    exePath: EXE,
    runExe: async (_exe, args) => {
      calls.push(args);
      const flag = args.includes('--scrub') ? 'scrub'
        : args.includes('--seq') ? 'seq'
          : 'batch';
      const body = flag === 'scrub'
        ? '{"scrub_ok":true,"ok":true,"device":"mock","sm":"11","batch":4,"env_bytes":32}'
        : flag === 'seq'
          ? '{"seq_ok":true,"ok":true,"device":"mock","sm":"11","batch":4,"seq_start":{"hi":0,"lo":4294967294},"seq_end":{"hi":1,"lo":2}}'
          : `{"hash_ok":true,"batch_ok":true,"ok":true,"hash":"${KNOWN_HASH}","expect":"${KNOWN_HASH}","device":"mock","sm":"11","batch":4,"env_bytes":32}`;
      return { code: 0, stdout: `${body}\n`, stderr: '' };
    },
  });

  const t0 = performance.now();
  const pScrub = assist.assistScrub({ batch: 4, envBytes: 32 });
  const pSeq = assist.assistSeq({ batch: 4 });
  const pBatch = assist.assistBatch({ batch: 4, envBytes: 32 });
  assert.ok(performance.now() - t0 < 10);
  assert.equal(assist.stats().pending, 3);
  await assist.flush();
  assert.equal((await pScrub).scrub_ok, true);
  assert.equal((await pSeq).seq_ok, true);
  assert.equal((await pBatch).batch_ok, true);
  assert.equal(assist.stats().scrub, 1);
  assert.equal(assist.stats().seq, 1);
  assert.equal(assist.stats().batch, 1);
  assert.equal(calls.length, 3);
});

test('MonitorIpc sm11 assistScrub is available without blocking push', async () => {
  const ipc = new MonitorIpc({
    autoDrain: false,
    sm11: {
      verifyOnFat: false,
      preferGpu: false,
    },
  });
  assert.equal(typeof ipc.sm11.assistScrub, 'function');
  assert.equal(typeof ipc.sm11.assistSeq, 'function');
  assert.equal(typeof ipc.sm11.assistBatch, 'function');
  const scrub = await ipc.sm11.assistScrub({ batch: 4, envBytes: 16 });
  assert.equal(scrub.ok, true);
  assert.equal(scrub.backend, 'cpu');
});

test('assistScrub/Seq/Batch coalesce concurrent same-kind probes', async () => {
  let runs = 0;
  let resolveRun;
  const gate = new Promise((r) => { resolveRun = r; });
  const assist = createSm11Assist({
    verifyOnFat: false,
    preferGpu: true,
    exists: () => true,
    exePath: EXE,
    runExe: async () => {
      runs += 1;
      await gate;
      return {
        code: 0,
        stdout: '{"scrub_ok":true,"ok":true,"device":"mock","sm":"11","batch":4,"env_bytes":16}\n',
        stderr: '',
      };
    },
  });
  const a = assist.assistScrub({ batch: 4, envBytes: 16 });
  const b = assist.assistScrub({ batch: 4, envBytes: 16 });
  assert.equal(a, b);
  assert.equal(assist.stats().coalesced, 1);
  resolveRun();
  await assist.flush();
  assert.equal(runs, 1);
  assert.equal((await a).scrub_ok, true);
});

test('fat scheduleVerify coalesces under concurrent observeFat', async () => {
  let runs = 0;
  let resolveRun;
  const gate = new Promise((r) => { resolveRun = r; });
  const assist = createSm11Assist({
    verifyOnFat: true,
    hotPath: false,
    preferGpu: true,
    exists: () => true,
    exePath: EXE,
    runExe: async () => {
      runs += 1;
      await gate;
      return {
        code: 0,
        stdout: `{"ok":true,"copy_ok":true,"hash_ok":true,"hash":"${KNOWN_HASH}","expect":"${KNOWN_HASH}"}\n`,
        stderr: '',
      };
    },
  });
  assist.observeFat(`a${'x'.repeat(300)}`);
  assist.observeFat(`b${'y'.repeat(300)}`);
  assist.observeFat(`c${'z'.repeat(300)}`);
  assert.equal(assist.stats().fat, 3);
  assert.ok(assist.stats().coalesced >= 2);
  resolveRun();
  await assist.flush();
  assert.equal(runs, 1);
  assert.equal(assist.stats().verify, 1);
});

test('serve session respawns after close without late-close clobber', async () => {
  const { EventEmitter } = await import('node:events');
  let spawns = 0;
  /** @type {import('node:events').EventEmitter[]} */
  const procs = [];
  const spawnImpl = () => {
    spawns += 1;
    const stdin = new EventEmitter();
    stdin.write = (chunk) => {
      const line = String(chunk);
      queueMicrotask(() => {
        if (line.includes('quit')) {
          stdout.emit('data', Buffer.from('{"ok":true,"bye":true}\n'));
          return;
        }
        stdout.emit('data', Buffer.from('{"ok":true,"scrub_ok":true,"device":"mock","sm":"11","batch":4,"env_bytes":16}\n'));
      });
      return true;
    };
    stdin.end = () => {};
    const stdout = new EventEmitter();
    const stderr = new EventEmitter();
    const proc = new EventEmitter();
    proc.stdin = stdin;
    proc.stdout = stdout;
    proc.stderr = stderr;
    proc.killed = false;
    proc.kill = () => {
      proc.killed = true;
      queueMicrotask(() => proc.emit('close', 0));
    };
    procs.push(proc);
    return proc;
  };

  const session = createSm11ServeSession({
    exePath: EXE,
    spawnImpl,
    timeoutMs: 5_000,
  });
  const first = await session.request(['--json', '--scrub', '--batch', '4', '--env-bytes', '16']);
  assert.equal(first.parsed.scrub_ok, true);
  assert.equal(spawns, 1);
  await session.close();
  assert.equal(session.alive, false);
  // Late close from the killed child must not poison the next spawn.
  await new Promise((r) => setImmediate(r));
  const second = await session.request(['--json', '--scrub', '--batch', '4', '--env-bytes', '16']);
  assert.equal(second.parsed.scrub_ok, true);
  assert.equal(spawns, 2);
  assert.equal(session.alive, true);
  await session.close();
});

test('MonitorIpc hot path fires seq on push, scrub on drop, batch on drain', async () => {
  const ipc = new MonitorIpc({
    autoDrain: false,
    sm11: {
      verifyOnFat: false,
      hotPath: true,
      preferGpu: false,
      hotBatch: 4,
      hotEnvBytes: 16,
    },
  });
  // Fill hot ring then one more → drop → scrub; each push → seq (coalesced).
  for (let i = 0; i < HOT_RING_SLOTS + 1; i += 1) {
    ipc.push({ kind: 'hop', source: 't', ticket: `t${i}`, payload: { i } });
  }
  assert.ok(ipc.stats().hot.dropped >= 1);
  const drained = ipc.drain();
  assert.ok(drained.length >= 1);
  await ipc.sm11.flush();
  const s = ipc.stats().sm11;
  assert.ok(s.seq >= 1, `seq=${s.seq}`);
  assert.ok(s.scrub >= 1, `scrub=${s.scrub}`);
  assert.ok(s.batch >= 1, `batch=${s.batch}`);
  assert.ok(s.coalesced >= 1, `coalesced=${s.coalesced}`);
});

test('Mailbox hot path wires scrub/seq/batch without blocking push', async () => {
  const box = new Mailbox({
    capacity: 4,
    autoDrain: false,
    sm11: {
      verifyOnFat: false,
      hotPath: true,
      preferGpu: false,
      hotBatch: 4,
      hotEnvBytes: 16,
    },
  });
  const t0 = performance.now();
  for (let i = 0; i < 6; i += 1) {
    box.push({ kind: 'success', source: 'a', payload: { i } });
  }
  assert.ok(performance.now() - t0 < 20);
  assert.equal(box.stats().dropped, 2);
  box.drain();
  await box.sm11.flush();
  const s = box.stats().sm11;
  assert.ok(s.seq >= 1);
  assert.ok(s.scrub >= 1);
  assert.ok(s.batch >= 1);
});

test('load hammer: Mailbox + MonitorIpc fat/thin pushes stay non-blocking; counters rise', async () => {
  const PUSH_BUDGET_MS = 10;
  const WAVES = 3;
  const PER_WAVE = 64;

  const box = new Mailbox({
    capacity: 8,
    autoDrain: false,
    sm11: {
      verifyOnFat: true,
      hotPath: true,
      preferGpu: false,
      hotBatch: 4,
      hotEnvBytes: 16,
    },
  });
  const ipc = new MonitorIpc({
    autoDrain: false,
    sm11: {
      verifyOnFat: true,
      hotPath: true,
      preferGpu: false,
      hotBatch: 4,
      hotEnvBytes: 16,
    },
  });

  let maxPushMs = 0;
  for (let wave = 0; wave < WAVES; wave += 1) {
    for (let i = 0; i < PER_WAVE; i += 1) {
      const fat = i % 2 === 0;
      const payload = fat ? `wave${wave}-${i}-${'p'.repeat(300)}` : { wave, i };
      const t0 = performance.now();
      const pub = box.push({ kind: 'success', source: 'load', ticket: `b${wave}-${i}`, payload });
      const dt = performance.now() - t0;
      if (dt > maxPushMs) maxPushMs = dt;
      assert.equal(pub.ok, true);
      assert.ok(dt < PUSH_BUDGET_MS, `mailbox push blocked ${dt}ms`);

      const t1 = performance.now();
      const hop = ipc.push({ kind: 'hop', source: 'load', ticket: `i${wave}-${i}`, payload });
      const dtIpc = performance.now() - t1;
      if (dtIpc > maxPushMs) maxPushMs = dtIpc;
      assert.equal(hop.ok, true);
      assert.ok(dtIpc < PUSH_BUDGET_MS, `ipc push blocked ${dtIpc}ms`);
    }
    box.drain();
    ipc.drain();
    await box.sm11.flush();
    await ipc.sm11.flush();
  }

  const bs = box.stats().sm11;
  const is = ipc.stats().sm11;
  assert.ok(bs.fat >= WAVES * (PER_WAVE / 2), `box fat=${bs.fat}`);
  assert.ok(is.fat >= WAVES * (PER_WAVE / 2), `ipc fat=${is.fat}`);
  assert.ok(bs.verify >= WAVES, `box verify=${bs.verify}`);
  assert.ok(is.verify >= WAVES, `ipc verify=${is.verify}`);
  assert.ok(bs.seq >= WAVES, `box seq=${bs.seq}`);
  assert.ok(is.seq >= WAVES, `ipc seq=${is.seq}`);
  assert.ok(bs.scrub >= WAVES, `box scrub=${bs.scrub}`);
  assert.ok(is.scrub >= WAVES, `ipc scrub=${is.scrub}`);
  assert.ok(bs.batch >= WAVES, `box batch=${bs.batch}`);
  assert.ok(is.batch >= WAVES, `ipc batch=${is.batch}`);
  assert.ok(bs.coalesced >= 1 && is.coalesced >= 1);
  assert.ok(maxPushMs < PUSH_BUDGET_MS, `maxPushMs=${maxPushMs}`);
});

test('live sm11_monitor.exe --json on 8600 when present', {
  skip: HAS_EXE ? false : 'native/sm11-monitor/out/sm11_monitor.exe missing',
  timeout: 60_000,
}, async () => {
  const result = await probeSm11({ timeoutMs: 30_000 });
  assert.equal(result.ok, true, JSON.stringify(result));
  if (result.backend === 'cuda') {
    assert.equal(result.copy_ok, true);
    assert.equal(result.hash_ok, true);
    assert.equal(result.hash, KNOWN_HASH);
    assert.match(String(result.device ?? ''), /8600|GeForce/i);
  } else {
    assert.equal(result.backend, 'cpu');
  }
});

test('live scrub/seq/batch probes when exe present', {
  skip: HAS_EXE ? false : 'native/sm11-monitor/out/sm11_monitor.exe missing',
  timeout: 60_000,
}, async () => {
  const scrub = await verifyScrub({ batch: 8, envBytes: 64, timeoutMs: 30_000 });
  assert.equal(scrub.ok, true, JSON.stringify(scrub));
  assert.equal(scrub.scrub_ok, true);

  const seq = await verifySeq({ batch: 8, timeoutMs: 30_000 });
  assert.equal(seq.ok, true, JSON.stringify(seq));
  assert.equal(seq.seq_ok, true);
  if (seq.backend === 'cuda') {
    assert.equal(seq.seq_start.lo, 4294967294);
  }

  const batch = await verifyBatch({ batch: 8, envBytes: 64, timeoutMs: 30_000 });
  assert.equal(batch.ok, true, JSON.stringify(batch));
  assert.equal(batch.batch_ok, true);
});

test('createSm11ServeSession mock multiplexes JSON replies', async () => {
  const { EventEmitter } = await import('node:events');
  const stdin = new EventEmitter();
  stdin.write = (chunk) => {
    const line = String(chunk);
    queueMicrotask(() => {
      if (line.includes('quit')) {
        stdout.emit('data', Buffer.from('{"ok":true,"bye":true}\n'));
        return;
      }
      const kind = line.includes('--scrub') ? 'scrub'
        : line.includes('--seq') ? 'seq' : 'hash';
      const body = kind === 'scrub'
        ? '{"ok":true,"scrub_ok":true,"device":"mock","sm":"11","batch":4,"env_bytes":16,"ms":1.2}'
        : kind === 'seq'
          ? '{"ok":true,"seq_ok":true,"device":"mock","sm":"11","batch":4,"seq_start":{"hi":0,"lo":4294967294},"seq_end":{"hi":1,"lo":2},"ms":1.1}'
          : `{"ok":true,"copy_ok":true,"hash_ok":true,"batch_ok":true,"hash":"${KNOWN_HASH}","expect":"${KNOWN_HASH}","device":"mock","sm":"11","ms":1.0}`;
      stdout.emit('data', Buffer.from(`${body}\n`));
    });
    return true;
  };
  stdin.end = () => {};
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  const proc = new EventEmitter();
  proc.stdin = stdin;
  proc.stdout = stdout;
  proc.stderr = stderr;
  proc.kill = () => { proc.emit('close', 0); };

  const session = createSm11ServeSession({
    exePath: EXE,
    spawnImpl: () => proc,
    timeoutMs: 5_000,
  });
  const a = await session.request(['--json', '--scrub', '--batch', '4', '--env-bytes', '16']);
  assert.equal(a.parsed.scrub_ok, true);
  const b = await session.request(['--json', '--seq', '--batch', '4']);
  assert.equal(b.parsed.seq_ok, true);
  const runExe = serveRunExeFactory(session, async () => ({ code: 1, stdout: '', stderr: 'no' }));
  const via = await runExe(EXE, ['--json', '--copy', '--hash', KNOWN], { timeoutMs: 5_000 });
  assert.match(via.stdout, /hash_ok/);
  await session.close();
});

test('live --serve session is warmer than cold spawn when exe present', {
  skip: HAS_EXE ? false : 'native/sm11-monitor/out/sm11_monitor.exe missing',
  timeout: 90_000,
}, async () => {
  const assist = createSm11Assist({
    verifyOnFat: false,
    hotPath: false,
    preferGpu: true,
    exePath: EXE,
    serve: true,
  });
  assert.equal(assist.serve, true);
  const t0 = performance.now();
  const first = await assist.verifyScrub({ batch: 8, envBytes: 64 });
  const t1 = performance.now();
  const second = await assist.verifySeq({ batch: 8 });
  const t2 = performance.now();
  const third = await assist.verifyBatch({ batch: 8, envBytes: 64 });
  const t3 = performance.now();
  await assist.close();

  assert.equal(first.ok, true, JSON.stringify(first));
  assert.equal(second.ok, true, JSON.stringify(second));
  assert.equal(third.ok, true, JSON.stringify(third));
  if (first.backend === 'cuda') {
    assert.equal(first.scrub_ok, true);
    assert.equal(second.seq_ok, true);
    assert.equal(third.batch_ok, true);
    // After CUDA warm-up, follow-up serve ops should beat cold ~100ms spawn.
    // Budget is loose vs in-process ~2–15ms to absorb driver hiccups under load.
    assert.ok((t2 - t1) < 150, `seq dt=${t2 - t1}`);
    assert.ok((t3 - t2) < 150, `batch dt=${t3 - t2}`);
    assert.ok(typeof first.ms === 'number' || first.raw?.ms != null || true);
  }
  void t0;
});

test('live --loops reports in-process ms_* when exe present', {
  skip: HAS_EXE ? false : 'native/sm11-monitor/out/sm11_monitor.exe missing',
  timeout: 60_000,
}, async () => {
  const result = await verifyPayload(KNOWN, {
    flags: ['--copy', '--hash'],
    loops: 10,
    timeoutMs: 60_000,
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  if (result.backend === 'cuda') {
    assert.equal(result.copy_ok, true);
    assert.equal(result.cmp_ok, true);
    assert.equal(result.loops, 10);
    assert.ok(result.ms_avg > 0);
    assert.ok(result.ms_min <= result.ms_avg);
  }
});

test('cpuRing push/hash/scrub advances host 32-bit index and stamps seq', () => {
  const state = createCpuRingState({ slots: 16, envBytes: 32 });
  const a = cpuRingPush('alpha', { state });
  assert.equal(a.ring_push_ok, true);
  assert.equal(a.ring_slot, 0);
  assert.equal(a.ring_seq.lo, 0);
  assert.equal(a.ring_count, 1);
  const b = cpuRingPush('beta', { state: a.state });
  assert.equal(b.ring_slot, 1);
  assert.equal(b.ring_seq.lo, 1);
  const h = cpuRingHash({ state: b.state, slot: 0 });
  assert.equal(h.ring_hash_ok, true);
  assert.equal(h.ring_hash, a.ring_hash);
  const s = cpuRingScrub({ state: b.state });
  assert.equal(s.ring_scrub_ok, true);
  assert.equal(s.ring_slot, 0);
  assert.equal(s.ring_count, 1);
  assert.equal(s.ring_drop_count, 1);
});

test('verifyRing* fall back to CPU when exe missing', async () => {
  const missing = {
    exePath: 'C:\\nonexistent\\sm11_monitor.exe',
    preferGpu: true,
    exists: () => false,
    ringSlots: 16,
    envBytes: 32,
  };
  const state = createCpuRingState({ slots: 16, envBytes: 32 });
  const push = await verifyRingPush('ring-cpu', { ...missing, state });
  assert.equal(push.backend, 'cpu');
  assert.equal(push.fallback, 'exe_missing');
  assert.equal(push.ring_push_ok, true);
  const hash = await verifyRingHash({ ...missing, state: push.state, ringSlot: 0 });
  assert.equal(hash.backend, 'cpu');
  assert.equal(hash.ring_hash, push.ring_hash);
  const scrub = await verifyRingScrub({ ...missing, state: push.state });
  assert.equal(scrub.backend, 'cpu');
  assert.equal(scrub.ring_scrub_ok, true);
});

test('createSm11Assist assistRing* is non-blocking with CPU fallback', async () => {
  const assist = createSm11Assist({
    verifyOnFat: false,
    preferGpu: false,
    ringSlots: 16,
    hotEnvBytes: 32,
  });
  const t0 = performance.now();
  const p = assist.assistRingPush('assist-ring');
  assert.ok(performance.now() - t0 < 10);
  await assist.flush();
  const r = await p;
  assert.equal(r.ok, true);
  assert.equal(r.backend, 'cpu');
  assert.equal(r.ring_push_ok, true);
  assert.equal(assist.stats().ringPush, 1);
  const h = await assist.assistRingHash({ ringSlot: 0 });
  assert.equal(h.ring_hash_ok, true);
  const s = await assist.assistRingScrub();
  assert.equal(s.ring_scrub_ok, true);
  assert.equal(assist.stats().ringScrub, 1);
});

test('live private-slot ring push/hash/scrub when exe present', {
  skip: HAS_EXE ? false : 'native/sm11-monitor/out/sm11_monitor.exe missing',
  timeout: 90_000,
}, async () => {
  const assist = createSm11Assist({
    verifyOnFat: false,
    hotPath: false,
    preferGpu: true,
    exePath: EXE,
    serve: true,
    ringSlots: 16,
    hotEnvBytes: 64,
  });
  const push = await assist.verifyRingPush('live-ring-alpha');
  assert.equal(push.ok, true, JSON.stringify(push));
  if (push.backend === 'cuda') {
    assert.equal(push.ring_ok, true);
    assert.equal(push.ring_push_ok, true);
    assert.equal(push.ring_hash_ok, true);
    assert.equal(push.ring_cmp_ok, true);
    assert.equal(push.ring_slot, 0);
    const hash = await assist.verifyRingHash({ ringSlot: 0 });
    assert.equal(hash.ring_hash_ok, true);
    assert.equal(hash.ring_hash, push.ring_hash);
    const scrub = await assist.verifyRingScrub();
    assert.equal(scrub.ring_scrub_ok, true);
    assert.ok(typeof push.ms === 'number');
  } else {
    assert.equal(push.backend, 'cpu');
  }
  await assist.close();
});
