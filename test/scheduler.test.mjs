import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PolicyGate } from '../src/scheduler.mjs';

test('maximize does not serialize unrelated work', async () => {
  const gate = new PolicyGate('maximize');
  const first = await gate.acquire();
  const second = await gate.acquire();
  assert.equal(gate.active, 2);
  first();
  second();
  assert.equal(gate.active, 0);
});

test('responsive queues a second heavy request', async () => {
  const gate = new PolicyGate('responsive');
  const first = await gate.acquire();
  let released = false;
  const pending = gate.acquire().then((release) => { released = true; release(); });
  assert.equal(released, false);
  first();
  await pending;
  assert.equal(released, true);
});

test('already-aborted signal on fast path throws and does not increment', async () => {
  const gate = new PolicyGate('maximize');
  const signal = AbortSignal.abort(new Error('aborted'));
  await assert.rejects(() => gate.acquire(signal), /aborted/);
  assert.equal(gate.active, 0);
});

test('abort before acquire when max is full rejects and leaves active unchanged', async () => {
  const gate = new PolicyGate('responsive');
  const first = await gate.acquire();
  assert.equal(gate.active, 1);
  const ac = new AbortController();
  const pending = gate.acquire(ac.signal);
  ac.abort(new Error('aborted'));
  await assert.rejects(() => pending, /aborted/);
  assert.equal(gate.active, 1);
  first();
  const third = await gate.acquire();
  assert.equal(gate.active, 1);
  third();
});

test('responsive abort waiter then third acquire proceeds', async () => {
  const gate = new PolicyGate('responsive');
  const first = await gate.acquire();
  const waiterAbort = new AbortController();
  const waiter = gate.acquire(waiterAbort.signal);
  waiterAbort.abort(new Error('aborted'));
  await assert.rejects(() => waiter, /aborted/);
  first();
  const third = await gate.acquire();
  assert.equal(gate.active, 1);
  third();
  assert.equal(gate.active, 0);
});

test('settle-once: abort after drain resolve does not reject', async () => {
  const gate = new PolicyGate('responsive');
  const first = await gate.acquire();
  const ac = new AbortController();
  const pending = gate.acquire(ac.signal);
  first();
  const release = await pending;
  ac.abort(new Error('aborted'));
  release();
  assert.equal(gate.active, 0);
  const next = await gate.acquire();
  next();
});
