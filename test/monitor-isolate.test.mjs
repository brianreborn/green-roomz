import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertCaller,
} from '../src/monitor/api.mjs';
import {
  createIsolate,
  ISO_CAP,
  ISOLATE_CALLS,
} from '../src/monitor/isolate.mjs';

test('map/unmap/grant roundtrip in-memory capability bits', () => {
  const iso = createIsolate();
  assert.deepEqual([...ISOLATE_CALLS], ['map', 'unmap', 'grant']);
  const bits = ISO_CAP.MAP | ISO_CAP.UNMAP | ISO_CAP.GRANT;
  const subject = 'place';

  const granted = iso.grant({ bits, subject }, { callerRole: 'place' });
  assert.equal(granted.ok, true);
  assert.equal(granted.call, 'grant');
  assert.equal(granted.bits & bits, bits);
  assert.equal(granted.voted, false);
  assert.equal(granted.mappedHostGpuRing, false);
  assert.equal(granted.wiped, false);
  assert.equal(granted.wipedSwap, false);
  assert.equal(granted.wipedRam, false);
  assert.equal(iso.bitsOf(subject) & bits, bits);

  const mapped = iso.map({ bits, subject }, { callerRole: 'respond' });
  assert.equal(mapped.ok, true);
  assert.equal(mapped.call, 'map');
  assert.equal(mapped.mapped, true);
  assert.equal(mapped.bits & bits, bits);
  assert.equal(mapped.voted, false);
  assert.equal(mapped.mappedHostGpuRing, false);
  assert.equal(iso.mappedBits(subject) & bits, bits);
  assert.equal(iso.bitsOf(subject) & bits, bits);

  const unmapped = iso.unmap({ bits, subject }, { callerRole: 'place' });
  assert.equal(unmapped.ok, true);
  assert.equal(unmapped.call, 'unmap');
  assert.equal(unmapped.bits & bits, 0);
  assert.equal(iso.mappedBits(subject) & bits, 0);
  assert.equal(iso.bitsOf(subject) & bits, bits, 'grant bits survive unmap');

  const remapped = iso.map({ bits, subject }, { callerRole: 'place' });
  assert.equal(remapped.ok, true);
  assert.equal(iso.mappedBits(subject) & bits, bits);

  const cleared = iso.unmap({ bits, subject }, { callerRole: 'respond' });
  assert.equal(cleared.ok, true);
  assert.equal(iso.mappedBits(subject) & bits, 0);
  assert.equal(iso.bitsOf(subject) & bits, bits);
});

test('SAD cannot map', () => {
  const iso = createIsolate();
  assert.throws(() => iso.map({ bits: ISO_CAP.MAP }, { callerRole: 'sad' }), /map not allowed for sad/);
  assert.throws(() => iso.grant({ bits: ISO_CAP.GRANT }, { callerRole: 'sad' }), /grant not allowed for sad/);
  assert.throws(() => iso.unmap({ bits: ISO_CAP.UNMAP }, { callerRole: 'worker' }), /unmap not allowed for worker/);
  assert.throws(() => iso.map({ bits: ISO_CAP.MAP }, { callerRole: 'logger' }), /map not allowed for logger/);
  assert.throws(() => iso.grant({ bits: ISO_CAP.LOCKDOWN }, { callerRole: 'green-roomz' }), /grant not allowed for green-roomz/);
  assert.throws(() => assertCaller('map', 'sad'), /map not allowed for sad/);
  assert.throws(() => assertCaller('unmap', 'sad'));
  assert.throws(() => assertCaller('grant', 'worker'));
  assert.throws(() => assertCaller('grant', 'logger'));
  assert.throws(() => assertCaller('map', 'green-roomz'));
  assert.throws(() => assertCaller('lockdown', 'sad'), /lockdown not allowed for sad/);
  assert.throws(() => assertCaller('lockdown', 'worker'));
  assert.throws(() => assertCaller('lockdown', 'logger'));
  assert.throws(() => assertCaller('lockdown', 'green-roomz'));
  assert.equal(assertCaller('map', 'place').ok, true);
  assert.equal(assertCaller('unmap', 'place').ok, true);
  assert.equal(assertCaller('grant', 'place').ok, true);
  assert.equal(assertCaller('map', 'respond').ok, true);
  assert.equal(assertCaller('grant', 'respond').ok, true);

  const fromPlace = iso.grant({
    bits: ISO_CAP.LOCKDOWN,
    subject: 'sad',
  }, { callerRole: 'place' });
  assert.equal(fromPlace.kind, 'reject');
  assert.match(fromPlace.reason, /lockdown not allowed for sad/);
  assert.notEqual(fromPlace.ok, true);
});

test('encrypt-volumes rejects; missing cap rejects', () => {
  const iso = createIsolate();
  const enc = iso.map({ verb: 'encrypt-volumes' }, { callerRole: 'place' });
  assert.equal(enc.kind, 'reject');
  assert.equal(enc.ok, false);
  assert.equal(enc.voted, false);
  assert.match(enc.reason, /out_of_v1/);
  const encGrant = iso.grant({ verb: 'encrypt-volumes' }, { callerRole: 'place' });
  assert.equal(encGrant.kind, 'reject');
  assert.match(encGrant.reason, /out_of_v1/);
  const encApply = iso.apply('encrypt-volumes', { callerRole: 'place' });
  assert.equal(encApply.kind, 'reject');
  assert.match(encApply.reason, /out_of_v1/);
  const encAlias = iso.encrypt({}, { callerRole: 'place' });
  assert.match(encAlias.reason, /out_of_v1/);

  const capped = createIsolate({ capabilities: [] });
  const miss = capped.map({ bits: ISO_CAP.MAP }, { callerRole: 'place' });
  assert.equal(miss.kind, 'reject');
  assert.match(miss.reason, /missing capability/);
  assert.notEqual(miss.ok, true);
  const missGrant = capped.grant({ bits: ISO_CAP.GRANT }, { callerRole: 'place' });
  assert.equal(missGrant.kind, 'reject');
  assert.match(missGrant.reason, /missing capability/);

  const note9 = createIsolate({ platform: 'note9', aidRoot: false });
  const nmap = note9.map({ bits: ISO_CAP.MAP }, { callerRole: 'place' });
  assert.equal(nmap.kind, 'reject');
  assert.match(nmap.reason, /missing capability/);
  const nwipe = note9.wipe({}, { callerRole: 'place' });
  assert.equal(nwipe.kind, 'reject');
  assert.match(nwipe.reason, /missing capability/);
  const nsr = note9.apply('secure_reboot', { callerRole: 'place' });
  assert.equal(nsr.kind, 'reject');
  assert.match(nsr.reason, /missing capability/);
  assert.notEqual(nsr.ok, true);
});

test('no respond verbs executed', () => {
  const invoked = [];
  const iso = createIsolate({
    respond: {
      lockdown() { invoked.push('lockdown'); },
      reboot() { invoked.push('reboot'); },
      secure_reboot() { invoked.push('secure_reboot'); },
      wipe() { invoked.push('wipe'); },
    },
  });
  const bits = ISO_CAP.LOCKDOWN | ISO_CAP.REBOOT | ISO_CAP.SECURE_REBOOT;
  const granted = iso.grant({ bits, subject: 'respond' }, { callerRole: 'respond' });
  assert.equal(granted.ok, true);
  const mapped = iso.map({ bits, subject: 'respond' }, { callerRole: 'place' });
  assert.equal(mapped.ok, true);
  const unmapped = iso.unmap({ bits, subject: 'respond' }, { callerRole: 'place' });
  assert.equal(unmapped.ok, true);
  for (const result of [
    iso.lockdown(),
    iso.reboot(),
    iso.secure_reboot(),
    iso.apply('lockdown', { callerRole: 'respond' }),
    iso.apply('reboot', { callerRole: 'respond' }),
    iso.apply('secure_reboot', { callerRole: 'respond' }),
  ]) {
    assert.equal(result.ok, false);
    assert.equal(result.executed, false);
    assert.equal(result.kind, 'reject');
  }
  assert.equal(invoked.length, 0, 'lockdown/reboot/secure_reboot must never execute');
  assert.equal(granted.wipedSwap, false);
  assert.equal(granted.wipedRam, false);
  assert.equal(mapped.wiped, false);
  assert.equal(mapped.voted, false);
  assert.equal(mapped.mappedHostGpuRing, false);
});
