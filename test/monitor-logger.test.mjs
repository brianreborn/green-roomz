import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertCaller } from '../src/monitor/api.mjs';
import { createLogger, verifyChain } from '../src/monitor/logger.mjs';
import { defaultExePath, fnv1a64Hex } from '../src/monitor/sm11-gpu.mjs';

test('emit then read order', async () => {
  const log = createLogger();
  const a = await log.emit({ payload: { n: 1 } });
  const b = await log.emit({ payload: { n: 2 } });
  const c = await log.emit({ payload: { n: 3 } });
  assert.equal(a.dropped, false);
  assert.equal(b.dropped, false);
  assert.equal(c.dropped, false);
  const recs = log.read();
  assert.equal(recs.length, 3);
  assert.equal(recs[0].payload.n, 1);
  assert.equal(recs[1].payload.n, 2);
  assert.equal(recs[2].payload.n, 3);
  assert.equal(recs[0].kind, 'observe');
});

test('chain verifies', async () => {
  const log = createLogger();
  await log.emit({ payload: { n: 1 } });
  await log.emit({ payload: { n: 2 } });
  const recs = log.read();
  assert.equal(verifyChain(recs), true);
  assert.match(recs[0].hash, /^[0-9a-f]+$/);
  assert.equal(recs[1].prev, recs[0].hash);
  recs[1].payload = { n: 99 };
  assert.equal(verifyChain(recs), false);
});

test('disk-fail drop (inject fake writer)', async () => {
  const log = createLogger({
    write() {
      const err = new Error('ENOSPC');
      err.code = 'ENOSPC';
      throw err;
    },
  });
  const result = await log.emit({ payload: { n: 1 } });
  assert.equal(result.dropped, true);
  assert.equal(log.read().length, 0);

  const mixed = createLogger({
    write(record) {
      if (record.payload.n === 2) {
        const err = new Error('ENOSPC');
        err.code = 'ENOSPC';
        throw err;
      }
    },
  });
  assert.equal((await mixed.emit({ payload: { n: 1 } })).dropped, false);
  assert.equal((await mixed.emit({ payload: { n: 2 } })).dropped, true);
  assert.equal((await mixed.emit({ payload: { n: 3 } })).dropped, false);
  const recs = mixed.read();
  assert.equal(recs.length, 2);
  assert.equal(recs[0].payload.n, 1);
  assert.equal(recs[1].payload.n, 3);
  assert.equal(verifyChain(recs), true);
});

test('emit from SAD ok', async () => {
  const log = createLogger();
  const result = await log.emit(
    { kind: 'grade', source: 'sad', payload: { grade: 'watch' } },
    { callerRole: 'sad' },
  );
  assert.equal(result.ok, true);
  assert.equal(result.dropped, false);
  const recs = log.read();
  assert.equal(recs.length, 1);
  assert.equal(recs[0].source, 'sad');
  assert.equal(recs[0].payload.grade, 'watch');
});

test('lockdown from logger denied', () => {
  assert.throws(() => assertCaller('lockdown', 'logger'), /lockdown not allowed for logger/);
  assert.throws(() => assertCaller('reboot', 'logger'));
  assert.throws(() => assertCaller('secure_reboot', 'logger'));
  const log = createLogger();
  assert.equal(Object.prototype.hasOwnProperty.call(log, 'lockdown'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(log, 'reboot'), false);
  assert.equal(typeof log.emit, 'function');
  assert.equal(typeof log.read, 'function');
});

test('records omit passwords tokens keys', async () => {
  const log = createLogger();
  await log.emit({
    payload: {
      event: 'login',
      n: 1,
      password: 'hunter2',
      token: 'abc',
      key: 'k',
    },
  });
  const [rec] = log.read();
  assert.equal(rec.payload.n, 1);
  assert.equal(rec.payload.event, 'login');
  assert.equal('password' in rec.payload, false);
  assert.equal('token' in rec.payload, false);
  assert.equal('key' in rec.payload, false);
});

test('stats().sm11 is null without assist; chain fields unchanged', async () => {
  const log = createLogger({ sm11: false });
  await log.emit({ payload: { n: 1 } });
  const s = log.stats();
  assert.equal(s.emitted, 1);
  assert.equal(s.dropped, 0);
  assert.equal(s.chain, 1);
  assert.equal(s.sm11, null);
  assert.equal(verifyChain(log.read()), true);
  assert.equal('gpu_fnv' in log.read()[0], false);
});

test('sm11 verify-assist schedules FNV without changing stored hash', async () => {
  const calls = [];
  const expectFnv = fnv1a64Hex('{"n":1}');
  const log = createLogger({
    sm11: {
      verifyOnFat: true,
      preferGpu: true,
      exePath: defaultExePath(),
      exists: () => true,
      runExe: async (_exe, args) => {
        calls.push(args);
        return {
          code: 0,
          stdout: `{"ok":true,"copy_ok":true,"hash_ok":true,"hash":"${expectFnv}","expect":"${expectFnv}"}\n`,
          stderr: '',
        };
      },
    },
  });
  const before = await log.emit({ payload: { n: 1 } });
  assert.equal(before.ok, true);
  assert.match(before.hash, /^[0-9a-f]{64}$/);
  await log.flush();
  const sm = log.stats().sm11;
  assert.ok(sm);
  assert.ok(sm.verifyAttempts >= 1);
  assert.equal(sm.gpuOk, 1);
  assert.ok(calls.length >= 1);
  assert.ok(calls[0].includes('--json'));
  const recs = log.read();
  assert.equal(verifyChain(recs), true);
  assert.equal(recs[0].hash, before.hash);
  assert.equal('gpu_fnv' in recs[0], false);
});
