import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SLOT_BYTES,
  HOT_RING_SLOTS,
  UPCALL_SLOTS,
  u64,
  u64Eq,
  u64Inc,
  ringIndex32,
  packSlot,
  unpackSlot,
  ENVELOPE_FIELDS,
  KINDS,
  makeEnvelope,
  makeUpcall,
  isAllowlistedOp,
  assertCaller,
  callerDeniedReason,
  canTransition,
  applyTransition,
  makeReject,
  snapshotIdentity,
  IDENTITY_FIELDS,
  vote,
  secureReboot,
} from '../src/monitor/api.mjs';

test('64-bit seq wrap is not identity', () => {
  const before = u64(0, 0xFFFFFFFF);
  const after = u64Inc(before);
  assert.deepEqual(after, u64(1, 0));
  assert.equal(ringIndex32(after, HOT_RING_SLOTS), ringIndex32(u64(0, 0), HOT_RING_SLOTS));
  assert.equal(ringIndex32(before, HOT_RING_SLOTS), ringIndex32(u64(0, 0xFFFFFFFF), HOT_RING_SLOTS));
  assert.equal(u64Eq(after, u64(0, 0)), false, 'lo wrap plus hi bump is not {0,0}');
  assert.equal(u64Eq(before, after), false);
  const packed = packSlot({ seq: after, ticket: before });
  assert.equal(packed.byteLength, SLOT_BYTES);
  const unpacked = unpackSlot(packed);
  assert.equal(u64Eq(unpacked.seq, after), true);
  assert.equal(u64Eq(unpacked.ticket, before), true);
});

test('illegal freeze to sleep is rejected', () => {
  assert.equal(canTransition('frozen', 'sleep'), false);
  assert.equal(canTransition('sleep', 'frozen'), false);
  const result = applyTransition('frozen', 'sleep', 'machine');
  assert.equal(result.ok, false);
  assert.equal(result.state, 'frozen');
  assert.equal(result.reject.kind, 'reject');
  assert.equal(result.reject.from, 'frozen');
  assert.equal(result.reject.to, 'sleep');
  assert.equal(result.reject.voted, false);
  assert.match(result.reject.reason, /illegal/);
  const freeze = applyTransition('up', 'freeze', 'eth0');
  assert.equal(freeze.ok, true);
  assert.equal(freeze.state, 'frozen');
});

test('lockdown caller is not SAD', () => {
  assert.throws(() => assertCaller('lockdown', 'sad'), /lockdown not allowed for sad/);
  assert.throws(() => assertCaller('reboot', 'sad'));
  assert.throws(() => assertCaller('secure_reboot', 'worker'));
  assert.throws(() => assertCaller('lockdown', 'logger'));
  assert.throws(() => assertCaller('lockdown', 'green-roomz'));
  assert.equal(callerDeniedReason('lockdown', 'sad') != null, true);
  const ok = assertCaller('lockdown', 'respond');
  assert.equal(ok.ok, true);
  assert.equal(assertCaller('post', 'sad').ok, true);
});

test('identity omits secrets', () => {
  const snap = snapshotIdentity({
    ticket: u64(0, 7),
    pid: 4242,
    tid: 8,
    password: 'hunter2',
    token: 'abc',
    cookie: 'sid=1',
    key: 'k',
    apiKey: 'nope',
    authorization: 'Bearer x',
    euid: 1000,
  });
  assert.equal(snap.pid, 4242);
  assert.equal(snap.tid, 8);
  assert.equal(snap.euid, 1000);
  assert.equal(snap.ringCpl, 'user');
  assert.equal('password' in snap, false);
  assert.equal('token' in snap, false);
  assert.equal('cookie' in snap, false);
  assert.equal('key' in snap, false);
  assert.equal('apiKey' in snap, false);
  assert.equal('authorization' in snap, false);
  for (const secret of ['password', 'token', 'cookie', 'key']) {
    assert.equal(snap[secret], undefined);
  }
  const again = snapshotIdentity({ ticket: u64(0, 7), pid: 1, password: 'other' });
  assert.equal(again.pid, 4242);
  assert.equal(again, snap);
  for (const field of IDENTITY_FIELDS) {
    if (field === 'vnodeGen') continue;
    assert.equal(field in snap, true);
  }
});

test('reject is idempotent on the same ticket', () => {
  const ticket = u64(9, 99);
  const first = makeReject({ ticket, from: 'up', to: 'sleep', reason: 'illegal freeze-sleep', source: 'monitor' });
  const second = makeReject({ ticket, from: 'frozen', to: 'sleep', reason: 'other', source: 'sad' });
  assert.equal(first.kind, 'reject');
  assert.equal(second, first);
  assert.equal(first.from, 'up');
  assert.equal(first.reason, 'illegal freeze-sleep');
  assert.equal(first.voted, false);
  assert.equal(u64Eq(first.ticket, ticket), true);
  assert.deepEqual(first.payload, { from: 'up', to: 'sleep', reason: 'illegal freeze-sleep' });
  for (const field of ENVELOPE_FIELDS) {
    assert.equal(field in first, true);
  }
});

test('envelope kinds, upcall allowlist, and slot counts', () => {
  for (const kind of ['hop', 'upcall', 'reply', 'reject', 'grade', 'vote', 'credit', 'snapshot', 'observe']) {
    assert.equal(KINDS.includes(kind), true);
  }
  const env = makeEnvelope({ kind: 'hop', source: 'ipc', ticket: 1, seq: 2, target: 'all-nics', payload: { n: 1 } });
  assert.deepEqual(Object.keys(env).sort(), [...ENVELOPE_FIELDS].sort());
  assert.equal(u64Eq(env.seq, u64(0, 2)), true);
  assert.equal(u64Eq(env.ticket, u64(0, 1)), true);
  assert.equal(isAllowlistedOp('observeHop'), true);
  assert.equal(isAllowlistedOp('health'), true);
  assert.equal(isAllowlistedOp('snapshot'), true);
  assert.equal(isAllowlistedOp('secure_reboot'), false);
  const up = makeUpcall({ ticket: u64(0, 3), payload: { agent: 'security-monitor-agent', op: 'health' } });
  assert.equal(up.kind, 'upcall');
  assert.deepEqual(up.payload, { agent: 'security-monitor-agent', op: 'health' });
  assert.equal(up.allowlisted, true);
  assert.equal(UPCALL_SLOTS, 16);
  assert.equal(HOT_RING_SLOTS, 256);
  assert.equal(SLOT_BYTES, 16);
  // API stubs return reject envelopes (never throw, never execute).
  const voted = vote();
  assert.equal(voted.ok, false);
  assert.equal(voted.kind, 'reject');
  assert.equal(voted.voted, false);
  assert.equal(voted.executed, false);
  assert.match(voted.reason, /uncallable|complex-last/);
  const rebooted = secureReboot();
  assert.equal(rebooted.ok, false);
  assert.equal(rebooted.kind, 'reject');
  assert.equal(rebooted.voted, false);
  assert.equal(rebooted.executed, false);
  assert.match(rebooted.reason, /uncallable|complex-last/);
});
