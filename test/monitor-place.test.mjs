import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertCaller,
  vote,
  secureReboot,
} from '../src/monitor/api.mjs';
import {
  createPlace,
  bind,
  PLACE_CALLS,
  FLOOR,
  QODESH,
  FORBIDDEN_CUDA_KERNELS,
  LAYOUT,
} from '../src/monitor/place.mjs';

test('bind then yield', () => {
  const place = createPlace();
  assert.deepEqual(Object.keys(place).sort(), ['bind', 'yield']);
  assert.deepEqual([...PLACE_CALLS], ['bind', 'yield']);
  assert.equal(QODESH.layout, '1+1');
  assert.equal(QODESH.extraSlots, 1);
  assert.equal(QODESH.cores, 2);
  assert.equal(QODESH.replicas, 1);
  assert.equal(FLOOR.includes('llama'), true);
  assert.equal(LAYOUT.hostSide, true);
  assert.equal(LAYOUT.cudaLaunch, false);
  assert.equal(LAYOUT.busyPoll, false);
  assert.equal(LAYOUT.replicas, 1);

  let voteTouched = false;
  const gated = createPlace({
    vote() { voteTouched = true; },
    respond: {
      lockdown() { voteTouched = true; },
      reboot() { voteTouched = true; },
      secure_reboot() { voteTouched = true; },
    },
    cuda: {
      launch() { voteTouched = true; },
    },
    lockdown() { voteTouched = true; },
  });

  const bound = gated.bind({ worker: 'w1', slice: 'monitor' }, { callerRole: 'scheduler' });
  assert.equal(bound instanceof Promise, false);
  assert.equal(typeof bound.then, 'undefined');
  assert.equal(bound.ok, true);
  assert.equal(bound.call, 'bind');
  assert.equal(bound.worker, 'w1');
  assert.equal(bound.slice, 'monitor');
  assert.equal(bound.hostSide, true);
  assert.equal(bound.cudaLaunch, false);
  assert.equal(bound.voted, false);
  assert.equal(bound.busyPoll, false);
  assert.equal(bound.replicas, 1);
  assert.equal(voteTouched, false);

  const released = gated.yield({ worker: 'w1', slice: 'monitor' }, { callerRole: 'scheduler' });
  assert.equal(released instanceof Promise, false);
  assert.equal(released.ok, true);
  assert.equal(released.call, 'yield');
  assert.equal(released.worker, 'w1');
  assert.equal(released.slice, 'monitor');
  assert.equal(released.voted, false);
  assert.equal(released.busyPoll, false);
  assert.equal(released.cudaLaunch, false);
  assert.equal(voteTouched, false);

  const again = gated.bind({ worker: 'w2', slice: 'sad-core' }, { callerRole: 'ipc' });
  assert.equal(again.ok, true);

  const overflow = gated.bind({ worker: 'w3', slice: 'other' }, { callerRole: 'ipc' });
  assert.equal(overflow.kind, 'reject');
  assert.notEqual(overflow.ok, true);
  assert.equal(overflow.voted, false);
  assert.match(overflow.reason, /1\+1|extra slot/);

  const viaIpc = bind({ worker: 'solo', slice: 'monitor' }, { callerRole: 'ipc' });
  assert.equal(viaIpc.ok, true);

  for (const name of FORBIDDEN_CUDA_KERNELS) {
    assert.throws(
      () => createPlace().bind({ worker: 'w', slice: 'monitor', kernel: name }, { callerRole: 'worker'.replace('worker', 'ipc') }),
      /MUST NOT launch/,
    );
  }
  assert.throws(
    () => createPlace().bind({ worker: 'w', slice: 'monitor', kernel: 'place' }, { callerRole: 'ipc' }),
    /MUST NOT launch/,
  );

  assert.equal(typeof place.lockdown, 'undefined');
  assert.equal(Object.prototype.hasOwnProperty.call(place, 'lockdown'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(place, 'vote'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(place, 'reboot'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(place, 'secure_reboot'), false);
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

test('second bind of llama floor rejected', () => {
  const place = createPlace();
  const steal = place.bind({ worker: 'w1', slice: 'llama' }, { callerRole: 'scheduler' });
  assert.equal(steal.kind, 'reject');
  assert.notEqual(steal.ok, true);
  assert.equal(steal.voted, false);
  assert.match(steal.reason, /llama|floor/);

  const again = place.bind({ worker: 'w2', slice: 'llama' }, { callerRole: 'ipc' });
  assert.equal(again.kind, 'reject');
  assert.match(again.reason, /llama|floor/);

  const gpu = place.bind({ worker: 'w1', slice: 'gpu' }, { callerRole: 'scheduler' });
  assert.equal(gpu.kind, 'reject');
  assert.match(gpu.reason, /llama|floor|gpu/);

  const extra = place.bind({ worker: 'w1', slice: 'monitor' }, { callerRole: 'scheduler' });
  assert.equal(extra.ok, true);
  const llamaWhileBusy = place.bind({ worker: 'w2', slice: 'llama' }, { callerRole: 'scheduler' });
  assert.equal(llamaWhileBusy.kind, 'reject');

  const cannotYieldFloor = place.yield({ slice: 'llama' }, { callerRole: 'scheduler' });
  assert.equal(cannotYieldFloor.kind, 'reject');
});

test('SAD cannot bind respond', () => {
  const place = createPlace();
  const result = place.bind(
    { worker: 'sad-1', slice: 'respond', workerRole: 'sad' },
    { callerRole: 'scheduler' },
  );
  assert.equal(result.kind, 'reject');
  assert.notEqual(result.ok, true);
  assert.equal(result.voted, false);
  assert.match(result.reason, /SAD cannot bind|respond/);

  const byName = place.bind({ worker: 'sad', slice: 'respond' }, { callerRole: 'ipc' });
  assert.equal(byName.kind, 'reject');
  assert.match(byName.reason, /SAD cannot bind|respond/);

  assert.throws(
    () => place.bind({ worker: 'w1', slice: 'monitor' }, { callerRole: 'sad' }),
    /bind not allowed for sad/,
  );
  assert.throws(
    () => place.yield({ slice: 'monitor' }, { callerRole: 'sad' }),
    /yield not allowed for sad/,
  );

  assert.equal(assertCaller('bind', 'scheduler').ok, true);
  assert.equal(assertCaller('bind', 'ipc').ok, true);
  assert.equal(assertCaller('yield', 'scheduler').ok, true);
  assert.equal(assertCaller('yield', 'ipc').ok, true);
  assert.throws(() => assertCaller('bind', 'sad'), /bind not allowed for sad/);
  assert.throws(() => assertCaller('yield', 'sad'), /yield not allowed for sad/);
  assert.throws(() => assertCaller('lockdown', 'sad'), /lockdown not allowed for sad/);
  assert.throws(() => assertCaller('reboot', 'sad'));
  assert.throws(() => assertCaller('secure_reboot', 'worker'));

  assert.equal(Object.prototype.hasOwnProperty.call(place, 'lockdown'), false);
  assert.equal(typeof place.lockdown, 'undefined');
  assert.equal(typeof place.reboot, 'undefined');
  assert.equal(typeof place.secure_reboot, 'undefined');
});

test('missing cap rejects', () => {
  const place = createPlace({ capabilities: [] });
  const miss = place.bind({ worker: 'w1', slice: 'monitor' }, { callerRole: 'scheduler' });
  assert.equal(miss.kind, 'reject');
  assert.match(miss.reason, /missing capability/);
  assert.notEqual(miss.ok, true);
  assert.equal(miss.voted, false);

  const y = place.yield({ worker: 'w1', slice: 'monitor' }, { callerRole: 'scheduler' });
  assert.equal(y.kind, 'reject');
  assert.match(y.reason, /missing capability/);

  const open = createPlace();
  const ok = open.bind({ worker: 'w1', slice: 'monitor' }, { callerRole: 'scheduler' });
  assert.equal(ok.ok, true);
});
