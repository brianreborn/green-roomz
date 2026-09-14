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
  verifyPayload,
  verifyScrub,
  verifySeq,
  verifyBatch,
  createSm11Assist,
  probeSm11,
  SM11_SEQ_START,
} from '../src/monitor/sm11-gpu.mjs';
import { MonitorIpc } from '../src/monitor/ipc.mjs';
import { sm11VerifyPayload, fnv1a64Hex as apiFnv } from '../src/monitor/api.mjs';
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
