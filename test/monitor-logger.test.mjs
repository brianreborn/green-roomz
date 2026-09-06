import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertCaller } from '../src/monitor/api.mjs';
import { createLogger, verifyChain } from '../src/monitor/logger.mjs';

test('emit then read order', async () => {
  const log = createLogger({ write() {} });
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
  const log = createLogger({ write() {} });
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
  assert.equal(result.ok, false);
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
  const failed = await mixed.emit({ payload: { n: 2 } });
  assert.equal(failed.ok, false);
  assert.equal(failed.dropped, true);
  assert.equal((await mixed.emit({ payload: { n: 3 } })).dropped, false);
  const recs = mixed.read();
  assert.equal(recs.length, 2);
  assert.equal(recs[0].payload.n, 1);
  assert.equal(recs[1].payload.n, 3);
  assert.equal(verifyChain(recs), true);
});

test('emit from SAD ok', async () => {
  const log = createLogger({ write() {} });
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
  const log = createLogger({ write() {} });
  assert.equal(Object.prototype.hasOwnProperty.call(log, 'lockdown'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(log, 'reboot'), false);
  assert.equal(typeof log.emit, 'function');
  assert.equal(typeof log.read, 'function');
});

test('records omit passwords tokens keys', async () => {
  const log = createLogger({ write() {} });
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

test('missing path flood and write fail return ok:false dropped:true', async () => {
  const missing = createLogger();
  const dropped = await missing.emit({ payload: { n: 1 } });
  assert.equal(dropped.ok, false);
  assert.equal(dropped.dropped, true);
  assert.equal(missing.read().length, 0);

  let releaseWrites;
  const held = new Promise((resolve) => { releaseWrites = resolve; });
  let started = 0;
  const slow = createLogger({
    write() { started += 1; return held; },
  });
  const inflight = [1, 2, 3, 4].map((n) => slow.emit({ payload: { n } }));
  for (let i = 0; i < 40 && started < 4; i += 1) await new Promise((r) => setImmediate(r));
  const fifth = await slow.emit({ payload: { n: 5 } });
  assert.equal(fifth.ok, false);
  assert.equal(fifth.dropped, true);
  releaseWrites();
  await Promise.all(inflight);
});

test('chain is capped', async () => {
  const log = createLogger({ write() {} });
  for (let i = 0; i < 300; i += 1) await log.emit({ payload: { n: i } });
  assert.ok(log.read().length <= 256);
});
