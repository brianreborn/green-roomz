import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  assertCaller,
  makeEnvelope,
  VERBS,
} from '../src/monitor/api.mjs';
import {
  createPolicy,
  GRADE,
  GRADES,
} from '../src/monitor/policy.mjs';
import {
  createRespond,
  replicaCount,
  DEFAULT_REPLICA_COUNT,
  DEFAULT_VOTE_TTL_MS,
  UNSATISFIABLE_QUORUM,
  VOTE_DOMAINS,
  VOTE_DOMAIN_LIST,
  localReplica,
  livePeer,
  localEmergency,
  REBOOT_CLASS,
  makeVoteRecord,
} from '../src/monitor/respond.mjs';
import * as respondMod from '../src/monitor/respond.mjs';

const RESPOND_SRC = readFileSync(
  fileURLToPath(new URL('../src/monitor/respond.mjs', import.meta.url)),
  'utf8',
);

test('8080 cannot lockdown', () => {
  assert.throws(() => assertCaller('lockdown', '8080'), /lockdown not allowed for 8080/);
  assert.throws(() => assertCaller('reboot', '8080'));
  assert.throws(() => assertCaller('secure_reboot', '8080'));
  assert.throws(() => assertCaller('lockdown', 'green-roomz'), /lockdown not allowed for green-roomz/);
  assert.throws(() => assertCaller('reboot', 'green-roomz'));
  assert.throws(() => assertCaller('secure_reboot', 'green-roomz'));
  assert.throws(() => assertCaller('lockdown', 'sad'));
  assert.throws(() => assertCaller('lockdown', 'worker'));
  assert.throws(() => assertCaller('lockdown', 'logger'));
  assert.equal(assertCaller('lockdown', 'respond').ok, true);

  const from8080 = createRespond().lockdown({ ticket: { hi: 0xCE50, lo: 1 } }, { callerRole: '8080' });
  assert.equal(from8080.kind, 'reject');
  assert.equal(from8080.ok, false);
  assert.equal(from8080.executed, false);
  assert.equal(from8080.spawned, false);
  assert.equal(from8080.implemented, false);
  assert.match(from8080.reason, /8080/);

  const gw = createRespond({ port: 8080 });
  const spoofed = gw.lockdown({ ticket: { hi: 0xCE50, lo: 2 } }, { callerRole: 'respond' });
  assert.equal(spoofed.kind, 'reject');
  assert.equal(spoofed.executed, false);
  assert.match(spoofed.reason, /8080/);
  const again = gw.lockdown({ ticket: { hi: 0xCE50, lo: 2 } }, { callerRole: 'respond' });
  assert.equal(again, spoofed);

  const named = createRespond().reboot({ ticket: { hi: 0xCE50, lo: 3 } }, { callerRole: 'green-roomz' });
  assert.equal(named.kind, 'reject');
  assert.equal(named.executed, false);
  assert.match(named.reason, /green-roomz|8080/);
});

test('SAD post wipe does not execute', async () => {
  const invoked = [];
  const spies = {
    lockdown() { invoked.push('lockdown'); },
    reboot() { invoked.push('reboot'); },
    secure_reboot() { invoked.push('secure_reboot'); },
    vote() { invoked.push('vote'); },
    wipe() { invoked.push('wipe'); },
  };
  const policy = createPolicy({ respond: spies });
  const env = makeEnvelope({
    kind: 'grade',
    source: 'sad',
    ticket: { hi: 0xCE50, lo: 11 },
    payload: { grade: 'wipe' },
  });
  const posted = await policy.check(env, { callerRole: 'sad' });
  assert.equal(invoked.length, 0);
  assert.equal(posted.grade, 'wipe');
  assert.equal(posted.type, GRADE);
  assert.notEqual(posted.type, 'verb');
  assert.equal(posted.executed, false);
  assert.equal(posted.inert, true);
  assert.equal(GRADES.includes('wipe'), true);
  assert.equal(VERBS.includes('wipe'), false);
  assert.equal(GRADE === 'wipe', false);

  const r = createRespond({ bootId: { hi: 1, lo: 1 } });
  const recorded = r.vote({
    ticket: { hi: 0xCE50, lo: 12 },
    domain: localEmergency,
    voter: 'sad',
    bootId: { hi: 1, lo: 1 },
    grade: 'wipe',
  }, { callerRole: 'sad' });
  assert.equal(recorded.ok, true);
  assert.equal(recorded.executed, false);
  assert.equal(recorded.vote.grade, 'wipe');
  assert.notEqual(recorded.vote.grade, recorded.vote.verb);
  assert.equal(recorded.vote.verb, '');
  const exec = r.secure_reboot({ ticket: { hi: 0xCE50, lo: 13 } }, { callerRole: 'sad' });
  assert.equal(exec.kind, 'reject');
  assert.equal(exec.executed, false);
  assert.equal(exec.spawned, false);
  assert.throws(() => assertCaller('secure_reboot', 'sad'));
});

test('replicaCount 1 cannot majority-reboot', () => {
  assert.equal(replicaCount, 1);
  assert.equal(DEFAULT_REPLICA_COUNT, 1);
  assert.notEqual(replicaCount, 3);
  assert.equal('REPLICAS' in respondMod, false);
  assert.equal(respondMod.REPLICAS, undefined);

  const r = createRespond({ replicaCount: 1, bootId: { hi: 2, lo: 2 } });
  assert.equal(r.replicaCount, 1);
  const ballots = r.vote({
    ticket: { hi: 0xCE50, lo: 21 },
    domain: localReplica,
    verb: 'reboot',
    voter: 'mvp-host-self',
    bootId: { hi: 2, lo: 2 },
  });
  assert.equal(ballots.ok, true);
  assert.equal(ballots.executed, false);

  const implicit = r.tally(localReplica, { verb: 'reboot' });
  assert.equal(implicit.reached, false);
  assert.equal(implicit.executed, false);
  assert.equal(Number.isNaN(implicit.quorum), true);
  assert.equal(Number.isNaN(UNSATISFIABLE_QUORUM), true);
  assert.equal(implicit.unsatisfiable, true);
  assert.equal(implicit.count, 1);
  assert.equal(implicit.replicaCount, 1);

  const forced = r.tally(localReplica, { verb: 'reboot', quorum: 1 });
  assert.equal(forced.reached, false, 'lone replica is not majority-of-itself for reboot');
  assert.equal(forced.unsatisfiable, true);
  assert.equal(forced.executed, false);

  const lockdownTally = r.tally({ domain: localReplica, verb: 'lockdown', quorum: 1 });
  assert.equal(lockdownTally.reached, false);
  assert.equal(lockdownTally.count, 0);

  const body = r.reboot({ ticket: { hi: 0xCE50, lo: 22 } }, { callerRole: 'respond' });
  assert.equal(body.kind, 'reject');
  assert.equal(body.executed, false);
  assert.equal(body.spawned, false);
  assert.match(body.reason, /uncallable/);
});

test('three domain types are distinct', () => {
  assert.equal(localReplica, 'localReplica');
  assert.equal(livePeer, 'livePeer');
  assert.equal(localEmergency, 'localEmergency');
  assert.notEqual(localReplica, livePeer);
  assert.notEqual(localReplica, localEmergency);
  assert.notEqual(livePeer, localEmergency);
  assert.deepEqual([...VOTE_DOMAIN_LIST], ['localReplica', 'livePeer', 'localEmergency']);
  assert.equal(VOTE_DOMAINS.localReplica, localReplica);
  assert.equal(VOTE_DOMAINS.livePeer, livePeer);
  assert.equal(VOTE_DOMAINS.localEmergency, localEmergency);
  assert.equal('n' in VOTE_DOMAINS, false);
  assert.equal(VOTE_DOMAINS.n, undefined);

  const r = createRespond({ bootId: { hi: 3, lo: 3 } });
  r.vote({
    ticket: { hi: 0xCE50, lo: 31 },
    domain: localReplica,
    verb: 'lockdown',
    voter: 'replica-a',
    bootId: { hi: 3, lo: 3 },
  });
  r.vote({
    ticket: { hi: 0xCE50, lo: 32 },
    domain: livePeer,
    verb: 'lockdown',
    voter: 'peer-b',
    bootId: { hi: 3, lo: 3 },
  });
  r.vote({
    ticket: { hi: 0xCE50, lo: 33 },
    domain: localEmergency,
    verb: 'wipe',
    voter: 'local-c',
    bootId: { hi: 3, lo: 3 },
    grade: 'wipe',
  });

  const a = r.tally(localReplica, { verb: 'lockdown', quorum: 1 });
  const b = r.tally(livePeer, { verb: 'lockdown', quorum: 1 });
  const c = r.tally(localEmergency, { verb: 'wipe', quorum: 1 });
  assert.equal(a.type, localReplica);
  assert.equal(b.type, livePeer);
  assert.equal(c.type, localEmergency);
  assert.notEqual(a.type, b.type);
  assert.notEqual(a.type, c.type);
  assert.notEqual(b.type, c.type);
  assert.equal(a.count, 1);
  assert.equal(b.count, 1);
  assert.equal(c.count, 1);
  assert.equal(a.waitsOnWan, false);
  assert.equal(b.waitsOnWan, true);
  assert.equal(c.waitsOnWan, false, 'wipe/localEmergency must not wait on WAN');
  assert.equal(c.reached, true);
  assert.equal(c.executed, false, 'localEmergency may record intent but MUST NOT execute');
  assert.equal(a.reached, false, 'reboot-class localReplica cannot self-majority at n=1');

  const rec = makeVoteRecord({
    ticket: 1,
    domain: localEmergency,
    verb: 'lockdown',
    voter: 'x',
    bootId: { hi: 0, lo: 1 },
    grade: 'wipe',
  });
  assert.equal(rec.type, localEmergency);
  assert.equal(rec.grade, 'wipe');
  assert.equal(rec.verb, 'lockdown');
  assert.notEqual(rec.grade, rec.verb);
  assert.equal(GRADES.includes(rec.grade), true);
  assert.equal(VERBS.includes(rec.grade), false);
});

test('Android-legacy phone missing cap rejects secure_reboot', () => {
  const androidLegacy = createRespond({ platform: 'android-legacy', aidRoot: false, bootId: { hi: 4, lo: 4 } });
  const missing = androidLegacy.secure_reboot({ ticket: { hi: 0xCE50, lo: 41 } }, { callerRole: 'respond' });
  assert.equal(missing.kind, 'reject');
  assert.match(missing.reason, /missing capability/);
  assert.notEqual(missing.ok, true);
  assert.equal(missing.executed, false);
  assert.equal(missing.spawned, false);

  const android = createRespond({ platform: 'android' });
  const also = android.secure_reboot({ ticket: { hi: 0xCE50, lo: 42 } }, { callerRole: 'respond' });
  assert.equal(also.kind, 'reject');
  assert.match(also.reason, /missing capability/);

  const capped = createRespond({ capabilities: [] });
  const capMiss = capped.lockdown({ ticket: { hi: 0xCE50, lo: 43 } }, { callerRole: 'respond' });
  assert.equal(capMiss.kind, 'reject');
  assert.match(capMiss.reason, /missing capability/);
  assert.notEqual(capMiss.ok, true);

  const okRole = createRespond({ bootId: { hi: 4, lo: 9 } });
  const uncallable = okRole.secure_reboot({ ticket: { hi: 0xCE50, lo: 44 } }, { callerRole: 'respond' });
  assert.equal(uncallable.kind, 'reject');
  assert.equal(uncallable.executed, false);
  assert.match(uncallable.reason, /uncallable/);
  assert.doesNotMatch(uncallable.reason, /missing capability/);
});

test('no OS spawn', () => {
  assert.doesNotMatch(RESPOND_SRC, /node:child_process/);
  assert.doesNotMatch(RESPOND_SRC, /child_process/);
  assert.doesNotMatch(RESPOND_SRC, /shutdown\.exe/i);
  assert.doesNotMatch(RESPOND_SRC, /Restart-Computer/);
  assert.doesNotMatch(RESPOND_SRC, /ExitWindowsEx/);
  assert.doesNotMatch(RESPOND_SRC, /InitiateSystemShutdown/);
  assert.doesNotMatch(RESPOND_SRC, /InitiateShutdown/);
  assert.doesNotMatch(RESPOND_SRC, /win32\/shutdown/i);
  assert.doesNotMatch(RESPOND_SRC, /process\.exit/);
  assert.doesNotMatch(RESPOND_SRC, /k32\.dll/i);
  for (const verb of REBOOT_CLASS) {
    assert.match(RESPOND_SRC, new RegExp(verb));
  }

  const r = createRespond({ bootId: { hi: 5, lo: 5 } });
  r.vote({
    ticket: { hi: 0xCE50, lo: 51 },
    domain: localReplica,
    verb: 'lockdown',
    voter: 'self',
    bootId: { hi: 5, lo: 5 },
  });
  for (const result of [
    r.lockdown({ ticket: { hi: 0xCE50, lo: 52 } }, { callerRole: 'respond' }),
    r.reboot({ ticket: { hi: 0xCE50, lo: 53 } }, { callerRole: 'respond' }),
    r.secure_reboot({ ticket: { hi: 0xCE50, lo: 54 } }, { callerRole: 'respond' }),
    r.halt('machine', { callerRole: 'respond' }),
  ]) {
    assert.equal(result.kind, 'reject');
    assert.equal(result.executed, false);
    assert.equal(result.spawned, false);
    assert.equal(result.implemented, false);
  }
});

test('boot-id mismatch is not applied; halt(machine) v1-illegal; ttl is a parameter', () => {
  assert.equal(DEFAULT_VOTE_TTL_MS, undefined);

  const r = createRespond({ bootId: { hi: 6, lo: 6 }, voteTtlMs: DEFAULT_VOTE_TTL_MS });
  const mismatch = r.vote({
    ticket: { hi: 0xCE50, lo: 61 },
    domain: localReplica,
    verb: 'reboot',
    voter: 'stale',
    bootId: { hi: 9, lo: 9 },
  });
  assert.equal(mismatch.kind, 'reject');
  assert.match(mismatch.reason, /boot-id mismatch/);
  assert.equal(r.records().length, 0);

  const missingBoot = r.vote({
    ticket: { hi: 0xCE50, lo: 62 },
    domain: localReplica,
    verb: 'reboot',
    voter: 'no-boot',
  });
  assert.equal(missingBoot.kind, 'reject');
  assert.match(missingBoot.reason, /boot-id/);

  const applied = r.vote({
    ticket: { hi: 0xCE50, lo: 63 },
    domain: livePeer,
    verb: 'lockdown',
    voter: 'peer',
    bootId: { hi: 6, lo: 6 },
    ttlMs: 5,
    ts: 1000,
  });
  assert.equal(applied.ok, true);
  const live = r.tally(livePeer, { verb: 'lockdown', quorum: 1, now: 1001 });
  assert.equal(live.count, 1);
  const expired = r.tally(livePeer, { verb: 'lockdown', quorum: 1, now: 1010 });
  assert.equal(expired.count, 0);

  const halted = r.halt('machine', { callerRole: 'respond', ticket: { hi: 0xCE50, lo: 64 } });
  assert.equal(halted.kind, 'reject');
  assert.match(halted.reason, /v1-illegal/);
  assert.equal(halted.executed, false);

  const first = r.lockdown({ ticket: { hi: 0xCE50, lo: 65 } }, { callerRole: 'worker' });
  const second = r.lockdown({ ticket: { hi: 0xCE50, lo: 65 } }, { callerRole: 'logger' });
  assert.equal(first.kind, 'reject');
  assert.equal(second, first);
  assert.equal(first.voted, false);
});
