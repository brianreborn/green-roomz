import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Mailbox } from '../src/mailbox.mjs';
import {
  HOT_RING_SLOTS,
  UPCALL_SLOTS,
  KINDS,
  ENVELOPE_FIELDS,
  CAP,
  CAP_DEFAULT,
  MonitorIpc,
  isHopClass,
  acceptTicket,
  u64,
  u64Eq,
  ringIndex32,
  ticketsMatch,
} from '../src/monitor/ipc.mjs';

test('copy-only: no mapped pinned host ring, drain clones do not alias slots', () => {
  const ipc = new MonitorIpc({ autoDrain: false });
  assert.equal(ipc.copyOnly, true);
  assert.equal(ipc.mappedPinnedHostRing, false);
  assert.equal(ipc.sharedMapping, null);
  assert.equal(ipc.hot.slots instanceof Array, true);
  assert.equal(typeof SharedArrayBuffer === 'function' && ipc.hot.slots instanceof SharedArrayBuffer, false);
  ipc.push({ kind: 'hop', source: 'ipc', ticket: 's-copy', payload: { n: 1 } });
  const peeked = ipc.peekHot();
  peeked[0].payload.n = 99;
  peeked[0].ticket = 'mutated';
  const drained = ipc.drain();
  assert.equal(drained.length, 1);
  assert.equal(drained[0].payload.n, 1);
  assert.equal(drained[0].ticket, 's-copy');
  drained[0].payload.n = 7;
  assert.equal(ipc.recent(1)[0].payload.n, 1);
});

test('two queues: hot drop-oldest cannot erase dedicated upcalls', () => {
  const ipc = new MonitorIpc({ autoDrain: false });
  const up = ipc.push({
    kind: 'upcall',
    source: 'monitor',
    ticket: 'u-keep',
    payload: { agent: 'security-monitor-agent', op: 'health' },
  });
  assert.equal(up.ok, true);
  for (let i = 0; i < HOT_RING_SLOTS + 8; i += 1) {
    ipc.push({ kind: 'hop', source: 'flood', ticket: 's-hot', payload: { i } });
  }
  assert.equal(ipc.stats().hot.capacity, HOT_RING_SLOTS);
  assert.equal(ipc.stats().hot.size, HOT_RING_SLOTS);
  assert.ok(ipc.stats().hot.dropped >= 8);
  assert.equal(ipc.stats().upcalls.capacity, UPCALL_SLOTS);
  assert.equal(ipc.stats().upcalls.size, 1);
  assert.equal(ipc.stats().upcalls.dropped, 0);
  const ups = ipc.peekUpcalls();
  assert.equal(ups.length, 1);
  assert.equal(ups[0].kind, 'upcall');
  assert.equal(ups[0].ticket, 'u-keep');
  assert.deepEqual(ups[0].payload, { agent: 'security-monitor-agent', op: 'health' });
});

test('upcall ring drop-oldest is independent of the hot ring', () => {
  const ipc = new MonitorIpc({ autoDrain: false });
  ipc.push({ kind: 'hop', source: 'h', ticket: 'stay', payload: { keep: true } });
  for (let i = 0; i < UPCALL_SLOTS + 3; i += 1) {
    ipc.push({
      kind: 'upcall',
      source: 'monitor',
      ticket: `u${i}`,
      payload: { agent: 'security-monitor-agent', op: 'observeHop' },
    });
  }
  assert.equal(ipc.stats().upcalls.size, UPCALL_SLOTS);
  assert.equal(ipc.stats().upcalls.dropped, 3);
  assert.equal(ipc.stats().hot.size, 1);
  assert.equal(ipc.peekHot()[0].payload.keep, true);
  assert.equal(ipc.peekUpcalls()[0].ticket, 'u3');
});

test('push is non-blocking and drain is broadcast (listeners do not steal)', async () => {
  const a = [];
  const b = [];
  const ipc = new MonitorIpc({ autoDrain: true, onEvent: (event) => a.push(event) });
  ipc.onEvent((event) => b.push(event));
  const t0 = performance.now();
  const published = ipc.push({
    kind: 'success',
    source: 'general-text-speculator',
    ticket: 's1',
    payload: { hops: ['general-text-speculator'] },
  });
  const elapsed = performance.now() - t0;
  assert.ok(elapsed < 10, `push took ${elapsed}ms`);
  assert.equal(published.ok, true);
  assert.equal(a.length, 0, 'must not drain inline on the user path');
  assert.equal(b.length, 0);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(a.length, 1);
  assert.equal(b.length, 1);
  assert.equal(a[0].kind, 'success');
  assert.equal(b[0].kind, 'success');
  assert.equal(a[0].ticket, 's1');
  assert.equal(b[0].ticket, 's1');
  assert.notEqual(a[0], b[0]);
});

test('seq is 64-bit {hi,lo}; 32-bit ring index is not identity', () => {
  const ipc = new MonitorIpc({ autoDrain: false, seq: u64(0, 0xFFFFFFFF) });
  const published = ipc.push({ kind: 'hop', source: 'ipc', ticket: u64(1, 2) });
  assert.equal(published.ok, true);
  assert.equal(u64Eq(published.seq, u64(1, 0)), true);
  assert.equal(ringIndex32(published.seq, HOT_RING_SLOTS), ringIndex32(u64(0, 0), HOT_RING_SLOTS));
  assert.equal(u64Eq(published.seq, u64(0, 0)), false);
  const [event] = ipc.drain();
  for (const field of ENVELOPE_FIELDS) {
    assert.equal(field in event, true);
  }
  assert.equal(u64Eq(event.ticket, u64(1, 2)), true);
});

test('ticket accepts string session ids and {hi,lo}', () => {
  const ipc = new MonitorIpc({ autoDrain: false });
  ipc.push({ kind: 'hop', source: 'gw', ticket: 'sess-live-1', payload: { hop: 1 } });
  ipc.push({ kind: 'observe', source: 'mon', ticket: { hi: 9, lo: 8 }, payload: { hop: 2 } });
  const events = ipc.drain();
  assert.equal(events[0].ticket, 'sess-live-1');
  assert.equal(u64Eq(events[1].ticket, u64(9, 8)), true);
  assert.equal(ticketsMatch('sess-live-1', 'sess-live-1'), true);
  assert.equal(u64Eq(acceptTicket({ hi: 9, lo: 8 }), u64(9, 8)), true);
});

test('kinds include monitor set plus gateway hop-class kinds', () => {
  const ipc = new MonitorIpc({ autoDrain: false });
  for (const kind of ['hop', 'upcall', 'reply', 'reject', 'grade', 'vote', 'credit', 'snapshot', 'observe']) {
    assert.equal(KINDS.includes(kind), true);
  }
  assert.equal(isHopClass('hop'), true);
  assert.equal(isHopClass('success'), true);
  assert.equal(isHopClass('agent_unavailable'), true);
  assert.equal(isHopClass('route_exhausted'), true);
  const kinds = ['hop', 'success', 'agent_unavailable', 'route_exhausted', 'grade', 'credit', 'snapshot', 'observe'];
  for (const kind of kinds) {
    const published = ipc.push({ kind, source: 't', ticket: `k-${kind}` });
    assert.equal(published.ok, true, kind);
  }
  const reply = ipc.reply({ source: 'handler', ticket: 'k-reply', payload: { ok: true } }, { role: 'handler' });
  assert.equal(reply.ok, true);
  const drained = ipc.drain();
  assert.equal(drained.some((event) => event.kind === 'success'), true);
  assert.equal(drained.some((event) => event.kind === 'agent_unavailable'), true);
  assert.equal(drained.some((event) => event.kind === 'route_exhausted'), true);
  assert.equal(drained.some((event) => event.kind === 'reply'), true);
});

test('vote/lockdown/reboot/secure_reboot remain uncallable stubs', () => {
  // Gateway/mailbox contract: stubs return reject envelopes (never throw, never execute).
  const ipc = new MonitorIpc({ autoDrain: false, rightsMask: CAP_DEFAULT | CAP.VOTE | CAP.LOCKDOWN | CAP.REBOOT | CAP.SECURE_REBOOT });
  for (const name of ['vote', 'lockdown', 'reboot', 'secureReboot', 'secure_reboot']) {
    const rejected = ipc[name]();
    assert.equal(rejected.ok, false, name);
    assert.equal(rejected.kind, 'reject', name);
    assert.equal(rejected.voted, false, name);
    assert.equal(rejected.executed, false, name);
    assert.match(rejected.reason, /uncallable|complex-last/, name);
  }
  const voted = ipc.push({ kind: 'vote', source: 'respond', ticket: u64(2, 2) });
  assert.equal(voted.ok, false);
  assert.equal(voted.reject.kind, 'reject');
  assert.match(voted.reject.reason, /uncallable|complex-last/);
  assert.equal(voted.reject.voted, false);
});

test('missing capability bit rejects; never silent no-op', () => {
  const ipc = new MonitorIpc({ autoDrain: false, rightsMask: 0 });
  const published = ipc.push({ kind: 'hop', source: 'worker', ticket: 'cap-miss', payload: { n: 1 } });
  assert.equal(published.ok, false);
  assert.equal(published.reject.kind, 'reject');
  assert.match(published.reject.reason, /missing capability/);
  const events = ipc.drain();
  assert.equal(events.length, 1);
  assert.equal(events[0].kind, 'reject');
  assert.equal(events.some((event) => event.kind === 'hop'), false);
  const again = ipc.push({ kind: 'hop', source: 'worker', ticket: 'cap-miss' });
  assert.equal(again.ok, false);
  assert.equal(again.reject.reason, published.reject.reason);
});

test('post/wait/reply: wait copies by ticket and does not steal', () => {
  const ipc = new MonitorIpc({ autoDrain: false, role: 'ipc' });
  const posted = ipc.post({ kind: 'hop', source: 'worker', ticket: 'wt-1', payload: { n: 4 } });
  assert.equal(posted.ok, true);
  const waited = ipc.wait('wt-1', { role: 'ticket_owner' });
  assert.equal(waited.ok, true);
  assert.equal(waited.events.length, 1);
  assert.equal(waited.events[0].payload.n, 4);
  assert.equal(ipc.stats().hot.size, 1, 'wait must not steal the slot');
  const stolen = ipc.wait('wt-1', { role: 'worker' });
  assert.equal(stolen.ok, false);
  assert.match(stolen.reject.reason, /not allowed/);
  const other = ipc.wait('no-such', { role: 'ticket_owner' });
  assert.equal(other.ok, true);
  assert.equal(other.events.length, 0);
});

test('non-allowlisted upcall is rejected', () => {
  const ipc = new MonitorIpc({ autoDrain: false });
  const published = ipc.push({
    kind: 'upcall',
    source: 'monitor',
    ticket: 'bad-op',
    payload: { agent: 'security-monitor-agent', op: 'secure_reboot' },
  });
  assert.equal(published.ok, false);
  assert.equal(published.reject.kind, 'reject');
  assert.match(published.reject.reason, /not allowlisted/);
});

test('mailbox still accepts numeric seq and string tickets for live hops', () => {
  const box = new Mailbox({ autoDrain: false });
  const published = box.push({
    kind: 'success',
    source: 'general-text-speculator',
    ticket: 's1',
    payload: { hops: ['general-text-speculator'] },
  });
  assert.equal(published.ok, true);
  assert.equal(typeof published.seq, 'number');
  const [event] = box.drain();
  assert.equal(event.ticket, 's1');
  assert.equal(typeof event.seq, 'number');
  assert.equal(event.kind, 'success');
  const u64pub = box.push({ kind: 'hop', source: 'mon', ticket: { hi: 1, lo: 7 }, seq: { hi: 0, lo: 9 } });
  assert.equal(typeof u64pub.seq, 'number');
  const [u64event] = box.drain();
  assert.deepEqual(u64event.ticket, { hi: 1, lo: 7 });
  assert.deepEqual(u64event.seq, { hi: 0, lo: 9 });
  assert.equal(u64event.target, 'machine');
});
