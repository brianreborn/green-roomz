import { test } from 'node:test';
import assert from 'node:assert/strict';
import { snapshotIdentity, IDENTITY_FIELDS } from '../src/monitor/identity.mjs';
import { createPolicy, GRADE } from '../src/monitor/policy.mjs';
import {
  canTransition, nextState, isValidTarget, applyTransition, makeReject, peekReject,
} from '../src/monitor/states.mjs';
import {
  makeEnvelope, makeUpcall, zeroId, TARGETS, isAllowlistedOp, callerDeniedReason, assertCaller,
} from '../src/monitor/api.mjs';
import {
  u32, u64, u64Eq, normalizeU64, hashStringToU64, nextPow2, ringMask, ringIndex32,
  packSlot, unpackSlot, SLOT_BYTES,
} from '../src/monitor/ids.mjs';
import {
  createRespond, makeVoteRecord, replicaCount, DEFAULT_VOTE_TTL_MS, UNSATISFIABLE_QUORUM,
  localReplica, livePeer, localEmergency, RESPOND_CAP,
} from '../src/monitor/respond.mjs';
import { createIsolate, ISO_CAP } from '../src/monitor/isolate.mjs';
import { createPlace } from '../src/monitor/place.mjs';
import {
  MonitorIpc, createMonitorIpc, CAP, hasCap, acceptTicket, ticketsMatch, cloneEnvelope,
  isHopClass, isU64Like,
} from '../src/monitor/ipc.mjs';

test('identity omits nested secrets and fills defaults', () => {
  const snap = snapshotIdentity({
    ticket: { hi: 0x1d, lo: 0xee01 },
    pid: Number.NaN,
    tid: 'nope',
    bootId: { hi: 1, lo: 2 },
    jail: 'cage',
    auid: Number.NaN,
    ringCpl: '',
    rightsMask: 7,
    vnodeGen: 99,
    sessionToken: 'hide-me',
    nested: { api_key: 'x', keep: 1, list: [{ cookieJar: 'c' }, 'ok'] },
    myKey: 'drop',
  });
  assert.equal(snap.pid, 0);
  assert.equal(snap.tid, 0);
  assert.equal(u64Eq(snap.bootId, u64(1, 2)), true);
  assert.equal(snap.jail, 'cage');
  assert.equal(snap.auid, -1);
  assert.equal(snap.ringCpl, 'user');
  assert.equal(snap.rightsMask, 7);
  assert.equal(snap.vnodeGen, 99);
  assert.equal('sessionToken' in snap, false);
  assert.equal('myKey' in snap, false);
  assert.equal('nested' in snap, false);
  for (const field of IDENTITY_FIELDS) {
    if (field === 'vnodeGen') continue;
    assert.equal(field in snap, true);
  }
  const again = snapshotIdentity({ ticket: { hi: 0x1d, lo: 0xee01 }, pid: 9 });
  assert.equal(again, snap);
  assert.equal(snapshotIdentity({ ticket: '' }).pid, 0);
});

test('policy branches: map shapes, live respond, tagged check, missing caps', async () => {
  const live = createPolicy({ respondProcess: { port: 9090 } });
  const mapped = live.label({ map: { grade: 'watch', verb: 'observe' } }, { callerRole: 'isolate' });
  assert.equal(mapped.ok, true);
  assert.equal(mapped.inert, false);
  const stop = live.label({ map: { stop: 'lockdown' } }, { callerRole: 'ipc' });
  assert.equal(stop.ok, true);
  assert.equal(stop.inert, false);
  const unknownMap = live.label({ map: { nope: 'down' } }, { callerRole: 'isolate' });
  assert.equal(unknownMap.kind, 'reject');
  const unknownLabel = live.label({ grade: 'explode', label: 'x' }, { callerRole: 'isolate' });
  assert.equal(unknownLabel.kind, 'reject');
  const emptyName = live.label({ grade: 'watch' }, { callerRole: 'isolate' });
  assert.equal(emptyName.ok, true);
  assert.equal(emptyName.label, '');
  const tagged = live.label({ label: 'trusted', grade: 'quarantine' }, { callerRole: 'isolate' });
  assert.equal(tagged.grade, 'quarantine');
  const hop = await live.check({ kind: 'hop', payload: { label: 'trusted' } }, { callerRole: 'ipc' });
  assert.equal(hop.grade, 'quarantine');
  assert.equal((await live.check('trusted', { callerRole: 'ipc' })).ok, true);
  assert.equal((await live.check(null, { callerRole: 'ipc' })).ok, true);
  const unknownGrade = await live.check({ kind: 'grade', grade: 'nope', ticket: { hi: 0x50, lo: 1 } }, { callerRole: 'sad' });
  assert.equal(unknownGrade.kind, 'reject');
  const posted = await live.check({ kind: 'grade', payload: { grade: 'watch' }, ticket: { hi: 0x50, lo: 2 } }, { callerRole: 'sad' });
  assert.equal(posted.grade, 'watch');
  assert.equal(posted.type, GRADE);
  const inert8080 = createPolicy({ respondProcess: { port: 8080 } });
  const stillInert = inert8080.label({ map: { stop: 'lockdown' } }, { callerRole: 'isolate' });
  assert.equal(stillInert.inert, true);
  const none = createPolicy({ respondProcess: false });
  assert.equal(none.label({ map: { stop: 'lockdown' } }, { callerRole: 'isolate' }).inert, true);
  const star = createPolicy({ capabilities: new Set(['*']) });
  assert.equal(star.label({ map: { quarantine: 'down' } }, { callerRole: 'isolate' }).ok, true);
  const arr = createPolicy({ capabilities: ['observe'] });
  assert.equal(arr.label({ map: { watch: 'observe' } }, { callerRole: 'isolate' }).ok, true);
  const missLabel = createPolicy({ capabilities: [] }).label({ label: 'n', grade: 'watch' }, { callerRole: 'isolate' });
  assert.equal(missLabel.kind, 'reject');
  const missGrade = await createPolicy({ capabilities: [] }).check(
    { kind: 'grade', payload: { grade: 'watch' }, ticket: { hi: 0x50, lo: 3 } },
    { callerRole: 'sad' },
  );
  assert.equal(missGrade.kind, 'reject');
  await assert.rejects(() => live.check({ payload: { call: 'lockdown' } }, { callerRole: 'ipc' }));
  assert.equal((await live.check({ payload: { call: 'observe' } }, { callerRole: 'ipc' })).ok, true);
});

test('states: illegal edges, snapshot, targets, reject peek', () => {
  assert.equal(canTransition('nope', 'up'), false);
  assert.equal(canTransition('up', 'nope'), false);
  assert.equal(nextState('nope', 'up'), undefined);
  assert.equal(nextState('up', 'nope'), undefined);
  assert.equal(isValidTarget('machine'), true);
  assert.equal(isValidTarget('all-nics'), true);
  assert.equal(isValidTarget('eth0'), true);
  assert.equal(isValidTarget(''), false);
  assert.equal(isValidTarget(null), false);
  const snapUp = applyTransition('up', 'snapshot', null);
  assert.equal(snapUp.ok, true);
  assert.equal(snapUp.action, 'snapshot');
  const snapFrozen = applyTransition('frozen', 'snapshot', 'eth0');
  assert.equal(snapFrozen.ok, true);
  const snapDown = applyTransition('down', 'snapshot');
  assert.equal(snapDown.ok, false);
  assert.match(snapDown.reject.reason, /snapshot only/);
  const thaw = applyTransition('frozen', 'thaw');
  assert.equal(thaw.ok, true);
  assert.equal(thaw.state, 'up');
  const wake = applyTransition('sleep', 'wake');
  assert.equal(wake.state, 'up');
  const halt = applyTransition('up', 'halt');
  assert.equal(halt.state, 'halt');
  const reset = applyTransition('halt', 'reset');
  assert.equal(reset.state, 'resetting');
  const down = applyTransition('resetting', 'down');
  assert.equal(down.state, 'down');
  const illegal = applyTransition('halt', 'up');
  assert.equal(illegal.ok, false);
  assert.match(illegal.reject.reason, /illegal/);
  const ticket = { hi: 0x57, lo: 9 };
  const first = makeReject({ ticket, from: 'up', to: 'halt', reason: 'no' });
  assert.equal(peekReject(ticket), first);
  assert.equal(peekReject({ hi: 0x57, lo: 99 }), null);
});

test('api/ids/calls uncovered helpers', () => {
  assert.deepEqual(zeroId(), u64(0, 0));
  assert.equal(TARGETS.includes('machine'), true);
  const env = makeEnvelope();
  assert.equal(env.kind, '');
  assert.equal(env.target, 'machine');
  const badUp = makeUpcall({ payload: { op: 'wipe', agent: 'x' } });
  assert.equal(badUp.allowlisted, false);
  const goodUp = makeUpcall({ op: 'snapshot', agent: 'a' });
  assert.equal(goodUp.allowlisted, true);
  assert.equal(isAllowlistedOp(null), false);
  assert.match(callerDeniedReason('no-such', 'ipc'), /unknown call/);
  assert.match(callerDeniedReason('reset', 'logger'), /reset not allowed/);
  assert.match(callerDeniedReason('reset', 'ntp'), /reset not allowed/);
  assert.match(callerDeniedReason('reset', 'entropy'), /reset not allowed/);
  assert.equal(callerDeniedReason('reset', 'admin'), null);
  assert.equal(assertCaller('post', 'worker').ok, true);
  assert.equal(u32(-1), 0xffffffff);
  assert.equal(u64Eq(normalizeU64(null), u64(0, 0)), true);
  assert.equal(u64Eq(normalizeU64(5n), u64(0, 5)), true);
  assert.equal(u64Eq(normalizeU64(7), u64(0, 7)), true);
  assert.equal(u64Eq(normalizeU64('12'), u64(0, 12)), true);
  assert.equal(u64Eq(normalizeU64('a:b'), u64(10, 11)), true);
  assert.equal(u64Eq(normalizeU64('not-a-number'), hashStringToU64('not-a-number')), true);
  assert.equal(u64Eq(normalizeU64({}), u64(0, 0)), true);
  assert.equal(nextPow2(3), 4);
  assert.equal(nextPow2(0), 2);
  assert.equal(ringMask(8), 7);
  assert.equal(ringIndex32(5, 8), 5);
  const packed = packSlot({ seq: u64(1, 2), ticket: u64(3, 4) });
  const fromBuf = unpackSlot(packed.buffer);
  assert.equal(u64Eq(fromBuf.seq, u64(1, 2)), true);
  assert.throws(() => unpackSlot(new Uint8Array(4)), /slot shorter/);
  assert.equal(SLOT_BYTES, 16);
});

test('respond vote/tally/halt/apply branches', () => {
  const boot = { hi: 0xb007, lo: 7 };
  const r = createRespond({ bootId: boot, replicaCount: 1, voteTtlMs: 1000 });
  assert.equal(r.replicaCount, replicaCount);
  assert.equal(Number.isNaN(UNSATISFIABLE_QUORUM), true);
  assert.equal(DEFAULT_VOTE_TTL_MS, undefined);
  const missDomain = r.vote({ verb: 'reboot', voter: 'a', bootId: boot, ticket: { hi: 0x70, lo: 1 } });
  assert.equal(missDomain.kind, 'reject');
  const badDomain = r.vote({ domain: 'wan', verb: 'reboot', voter: 'a', bootId: boot, ticket: { hi: 0x70, lo: 2 } });
  assert.match(badDomain.reason, /unknown vote domain/);
  const noBoot = r.vote({ domain: localReplica, verb: 'reboot', voter: 'a', ticket: { hi: 0x70, lo: 3 } });
  assert.match(noBoot.reason, /boot-id/);
  const mismatch = r.vote({ domain: localReplica, verb: 'reboot', voter: 'a', bootId: { hi: 1, lo: 1 }, ticket: { hi: 0x70, lo: 4 } });
  assert.match(mismatch.reason, /mismatch/);
  const rec = makeVoteRecord({
    domain: localReplica,
    verb: 'secureReboot',
    voter: 'v1',
    bootId: boot,
    ticket: { hi: 0x70, lo: 5 },
    grade: 'stop',
    ttlMs: 50,
    payload: { ts: 1 },
  });
  assert.equal(rec.verb, 'secure_reboot');
  assert.equal(rec.grade, 'stop');
  const ok = r.vote({ domain: localReplica, verb: 'reboot', voter: 'v1', bootId: boot, ticket: { hi: 0x70, lo: 6 } });
  assert.equal(ok.ok, true);
  assert.equal(ok.applied, true);
  const dup = r.vote({ domain: localReplica, verb: 'reboot', voter: 'v1', bootId: boot, ticket: { hi: 0x70, lo: 6 } });
  assert.equal(dup.duplicate, true);
  r.vote({ domain: livePeer, verb: 'reboot', voter: 'p1', bootId: boot, ticket: { hi: 0x70, lo: 7 } });
  r.vote({ domain: localEmergency, verb: 'lockdown', voter: 'e1', bootId: boot, ticket: { hi: 0x70, lo: 8 }, expiry: 1 });
  const tallyBad = r.tally('nope', { verb: 'reboot' });
  assert.equal(tallyBad.kind, 'reject');
  const local = r.tally({ domain: localReplica, verb: 'reboot' });
  assert.equal(local.unsatisfiable, true);
  assert.equal(local.reached, false);
  const peer = r.tally(livePeer, { verb: 'reboot', quorum: 1 });
  assert.equal(peer.waitsOnWan, true);
  assert.equal(peer.reached, true);
  const expired = r.tally(localEmergency, { verb: 'lockdown', now: 999999, quorum: 1 });
  assert.equal(expired.count, 0);
  const ttl = r.tally(localReplica, { verb: 'reboot', now: 10 ** 12 });
  assert.equal(typeof ttl.count, 'number');
  const haltMachine = r.halt('machine', { callerRole: 'respond' });
  assert.match(haltMachine.reason, /halt\(machine\)/);
  const haltIf = r.halt({ target: 'eth0' }, { callerRole: 'respond' });
  assert.equal(haltIf.executed, false);
  assert.match(haltIf.reason, /uncallable/);
  const lockdown = r.lockdown({ ticket: { hi: 0x70, lo: 9 } }, { callerRole: 'respond' });
  assert.match(lockdown.reason, /uncallable/);
  const alias = r.secureReboot({ ticket: { hi: 0x70, lo: 10 } }, { callerRole: 'respond' });
  assert.equal(alias.executed, false);
  const applyVote = r.apply('vote', { domain: localReplica, verb: 'reboot', voter: 'v2', bootId: boot, ticket: { hi: 0x70, lo: 11 } });
  assert.equal(applyVote.ok, true);
  const applyTally = r.apply({ verb: 'tally', domain: localReplica, op: 'reboot' });
  assert.equal(applyTally.ok, true);
  const applyUnknown = r.apply('wiggle');
  assert.match(applyUnknown.reason, /unknown call/);
  const applyEmpty = r.apply('');
  assert.match(applyEmpty.reason, /missing verb/);
  const capMiss = createRespond({ capabilities: [] }).vote({
    domain: localReplica, verb: 'reboot', voter: 'a', bootId: { hi: 0, lo: 1 }, ticket: { hi: 0x70, lo: 12 },
  });
  assert.match(capMiss.reason, /missing capability/);
  const maskMiss = createRespond({ rightsMask: 0, bootId: boot }).lockdown({ ticket: { hi: 0x70, lo: 13 } }, { callerRole: 'respond' });
  assert.match(maskMiss.reason, /missing capability/);
  const note9 = createRespond({ platform: 'note9', bootId: boot }).secure_reboot({ ticket: { hi: 0x70, lo: 14 } }, { callerRole: 'respond' });
  assert.match(note9.reason, /missing capability/);
  const aid = createRespond({ aidRoot: false, bootId: boot }).apply('secure_reboot', { ticket: { hi: 0x70, lo: 15 }, callerRole: 'respond' });
  assert.match(aid.reason, /missing capability/);
  const port8080 = createRespond({ port: 8080 }).reboot({ ticket: { hi: 0x70, lo: 16 } }, { callerRole: 'respond' });
  assert.match(port8080.reason, /8080/);
  const sad = createRespond({ bootId: boot }).lockdown({ ticket: { hi: 0x70, lo: 17 } }, { callerRole: 'sad' });
  assert.match(sad.reason, /not allowed/);
  assert.equal(r.records().length >= 1, true);
  assert.equal(r.appliedCount() >= 1, true);
  const star = createRespond({ capabilities: '*', bootId: boot, rightsMask: RESPOND_CAP.VOTE });
  const voted = star.vote({ domain: localReplica, verb: 'reboot', voter: 'z', bootId: boot, ticket: { hi: 0x70, lo: 18 } });
  assert.equal(voted.ok, true);
});

test('isolate parseBits, encrypt/wipe, aid-root, unmap clear, apply dispatch', () => {
  const iso = createIsolate();
  const named = iso.grant({ cap: 'map', subject: 'place' }, { callerRole: 'place' });
  assert.equal(named.ok, true);
  const arr = iso.grant({ bits: ['unmap', 'grant'], subject: 'place' }, { callerRole: 'place' });
  assert.equal(arr.ok, true);
  const str = iso.map({ bits: 'MAP', subject: 'place' }, { callerRole: 'place' });
  assert.equal(str.ok, true);
  const enc = iso.grant({ bits: ISO_CAP.ENCRYPT, subject: 'place' }, { callerRole: 'place' });
  assert.match(enc.reason, /out_of_v1/);
  const wipeBit = iso.map({ bits: ISO_CAP.WIPE, subject: 'place' }, { callerRole: 'place' });
  assert.match(wipeBit.reason, /out_of_v1|missing capability/);
  const encApply = iso.apply('encrypt-volumes', { callerRole: 'place' });
  assert.match(encApply.reason, /out_of_v1/);
  const wipeApply = iso.wipe({}, { callerRole: 'place' });
  assert.match(wipeApply.reason, /out_of_v1/);
  const unknown = iso.apply('wiggle', { callerRole: 'place' });
  assert.match(unknown.reason, /unknown call/);
  const lockReject = iso.lockdown();
  assert.equal(lockReject.kind, 'reject');
  assert.equal(lockReject.ok, false);
  assert.match(lockReject.reason, /uncallable/);
  const rebootReject = iso.reboot();
  assert.equal(rebootReject.kind, 'reject');
  assert.equal(rebootReject.ok, false);
  assert.match(rebootReject.reason, /uncallable/);
  const secureReject = iso.secure_reboot();
  assert.equal(secureReject.kind, 'reject');
  assert.equal(secureReject.ok, false);
  assert.match(secureReject.reason, /uncallable/);
  const applyLock = iso.apply('lockdown', { callerRole: 'place' });
  assert.equal(applyLock.kind, 'reject');
  assert.equal(applyLock.ok, false);
  assert.match(applyLock.reason, /uncallable/);
  iso.map({ bits: ISO_CAP.MAP | ISO_CAP.UNMAP, subject: 'core' }, { callerRole: 'place' });
  const cleared = iso.unmap({ subject: 'core' }, { callerRole: 'place' });
  assert.equal(cleared.mapped, false);
  const miss = createIsolate({ capabilities: [] }).grant({ bits: ISO_CAP.GRANT }, { callerRole: 'place' });
  assert.match(miss.reason, /missing capability/);
  const note9 = createIsolate({ platform: 'android' }).map({ bits: ISO_CAP.MAP }, { callerRole: 'place' });
  assert.match(note9.reason, /missing capability/);
  const mask = createIsolate({ rightsMask: 0 }).unmap({ bits: ISO_CAP.UNMAP }, { callerRole: 'place' });
  assert.match(mask.reason, /missing capability/);
  const sadLock = iso.grant({ bits: ISO_CAP.LOCKDOWN, subject: 'sad' }, { callerRole: 'place' });
  assert.match(sadLock.reason, /lockdown not allowed/);
  const viaApply = iso.apply({ call: 'grant', bits: ISO_CAP.GRANT, subject: 'place', callerRole: 'respond' });
  assert.equal(viaApply.ok, true);
  const emptyVerb = iso.apply({}, { callerRole: 'place' });
  assert.match(emptyVerb.reason, /missing verb/);
});

test('place yield lookup, floors, cuda, already-bound, extraSlots', () => {
  const place = createPlace({ extraSlots: 2 });
  const bound = place.bind({ payload: { worker: 'w1', slice: 'monitor' } }, { callerRole: 'scheduler' });
  assert.equal(bound.ok, true);
  const again = place.bind({ worker: 'w9', slice: 'monitor' }, { callerRole: 'ipc' });
  assert.match(again.reason, /already bound/);
  const byWorker = place.yield({ worker: 'w1' }, { callerRole: 'scheduler' });
  assert.equal(byWorker.ok, true);
  const rebound = place.bind({ worker: 'w2', slice: 'aux' }, { callerRole: 'ipc' });
  assert.equal(rebound.ok, true);
  const firstExtra = place.yield({}, { callerRole: 'ipc' });
  assert.equal(firstExtra.ok, true);
  const missing = place.yield({ slice: 'nope' }, { callerRole: 'ipc' });
  assert.match(missing.reason, /not bound/);
  const ipcFloor = place.bind({ slice: 'ipc', worker: 'w' }, { callerRole: 'scheduler' });
  assert.match(ipcFloor.reason, /floor/);
  const loggerFloor = place.bind({ slice: 'logger', worker: 'w' }, { callerRole: 'scheduler' });
  assert.match(loggerFloor.reason, /floor/);
  const respondFloor = place.bind({ slice: 'respond_voter', worker: 'w' }, { callerRole: 'scheduler' });
  assert.match(respondFloor.reason, /floor|respond/);
  assert.throws(
    () => place.bind({ worker: 'w', slice: 'monitor', asCuda: true }, { callerRole: 'ipc' }),
    /MUST NOT launch/,
  );
  assert.throws(
    () => place.bind({ worker: 'w', slice: 'monitor', cudaLaunch: true, kernel: 'logger' }, { callerRole: 'ipc' }),
    /MUST NOT launch/,
  );
  const star = createPlace({ capabilities: new Set(['*']) });
  assert.equal(star.bind({ worker: 'w', slice: 'monitor' }, { callerRole: 'scheduler' }).ok, true);
});

test('ipc remaining push/wait/clone/observe branches', () => {
  assert.equal(hasCap(0, 0), true);
  assert.equal(hasCap(CAP.POST, CAP.WAIT), false);
  assert.equal(acceptTicket(''), '');
  assert.equal(u64Eq(acceptTicket(4), u64(0, 4)), true);
  assert.equal(isU64Like(u64(1, 2)), true);
  assert.equal(isU64Like(null), false);
  assert.equal(isHopClass('nope'), false);
  assert.equal(ticketsMatch('a', 'a'), true);
  assert.equal(ticketsMatch(u64(1, 1), u64(1, 1)), true);
  assert.equal(ticketsMatch('sess', hashStringToU64('sess')) || ticketsMatch('sess', 'sess'), true);
  const ipc = createMonitorIpc({ autoDrain: false, recentLimit: 2 });
  assert.equal(typeof ipc.onEvent(null), 'function');
  const off = ipc.onEvent(() => {});
  off();
  const missing = ipc.push({ source: 'x' });
  assert.match(missing.reject.reason, /missing kind/);
  const unknown = ipc.push({ kind: 'wiggle', source: 'x', ticket: 'k' });
  assert.match(unknown.reject.reason, /unknown kind/);
  const observed = ipc.observeHop('success', 'code', { ticket: 't-obs', payload: { n: 1 } });
  assert.equal(observed.ok, true);
  const long = ipc.push({ kind: 'hop', source: 'x', ticket: 'long', payload: 'z'.repeat(300) });
  assert.equal(long.ok, true);
  const hashed = ipc.peekHot().at(-1);
  assert.equal(typeof hashed.payload, 'string');
  assert.equal(hashed.payload.length, 64);
  const arrPay = ipc.push({ kind: 'credit', source: 'x', ticket: 'arr', payload: [1, 2] });
  assert.equal(arrPay.ok, true);
  const cloned = cloneEnvelope(ipc.peekHot()[0]);
  assert.equal(cloned.kind, ipc.peekHot()[0].kind);
  ipc.post({ source: 'w', ticket: 'p1' });
  const waitCap = ipc.wait('p1', { rightsMask: 0, role: 'ticket_owner' });
  assert.match(waitCap.reject.reason, /missing capability/);
  const mixed = new MonitorIpc({ autoDrain: false });
  mixed.push({ kind: 'hop', source: 'h', ticket: 's', seq: u64(0, 2) });
  mixed.push({ kind: 'upcall', source: 'u', ticket: 's', payload: { op: 'health', agent: 'm' }, seq: u64(0, 1) });
  const peeked = mixed.peek();
  assert.equal(peeked[0].kind, 'upcall');
  const boom = new MonitorIpc({ autoDrain: false });
  boom.onEvent(() => { throw new Error('listener'); });
  boom.push({ kind: 'hop', source: 'x', ticket: 'b' });
  const drained = boom.drain();
  assert.equal(drained.length, 1);
  assert.equal(ipc.recent(0).length, 0);
  const replyCap = ipc.reply({ ticket: 'r' }, { rightsMask: 0, role: 'handler' });
  assert.match(replyCap.reject.reason, /missing capability/);
});
