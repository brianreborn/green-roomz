import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertCaller,
  vote,
} from '../src/monitor/api.mjs';
import {
  createGate,
  begin,
  end,
  GATE_CALLS,
  GPU_KERNELS,
  FORBIDDEN_CUDA_KERNELS,
  PIPELINE,
} from '../src/monitor/gate.mjs';

test('begin then end', () => {
  const gate = createGate();
  assert.deepEqual(Object.keys(gate).sort(), ['begin', 'end']);
  assert.deepEqual([...GATE_CALLS], ['begin', 'end']);
  assert.deepEqual([...GPU_KERNELS], ['conv', 'gemm']);
  assert.equal(PIPELINE.sm, '1.1');
  assert.equal(PIPELINE.concurrentKernels, false);
  assert.equal(PIPELINE.hostSide, true);
  assert.equal(PIPELINE.copyEngineMailbox, false);
  assert.equal(PIPELINE.afterburner, false);
  assert.equal(PIPELINE.clockLoops, false);
  assert.equal(PIPELINE.cudaSampleRerun, false);
  assert.equal(PIPELINE.cpu, 'llama');
  assert.equal(PIPELINE.gpu, 'packed');

  const started = gate.begin({ kernel: 'conv', ticket: 1 }, { callerRole: 'worker' });
  assert.equal(started.ok, true);
  assert.equal(started.call, 'begin');
  assert.equal(started.kernel, 'conv');
  assert.equal(started.hostSide, true);
  assert.equal(started.voted, false);
  assert.equal(started.copyEngineMailbox, false);
  assert.equal(started.concurrentKernels, false);
  assert.deepEqual(started.overlap, { cpu: 'llama', gpu: 'packed' });

  const finished = gate.end({ ticket: 1 }, { callerRole: 'worker' });
  assert.equal(finished.ok, true);
  assert.equal(finished.call, 'end');
  assert.equal(finished.kernel, 'conv');
  assert.equal(finished.hostSide, true);
  assert.equal(finished.voted, false);

  const gemm = createGate();
  const gStart = gemm.begin({ kernel: 'gemm' }, { callerRole: 'ipc' });
  assert.equal(gStart.kernel, 'gemm');
  const gEnd = gemm.end({}, { callerRole: 'ipc' });
  assert.equal(gEnd.ok, true);

  const viaIpc = begin({ kernel: 'conv' }, { callerRole: 'ipc' });
  assert.equal(viaIpc.ok, true);
  assert.equal(end({}, { callerRole: 'gpu_gate' }).ok, true);

  for (const name of FORBIDDEN_CUDA_KERNELS) {
    assert.throws(
      () => createGate().begin({ kernel: name }, { callerRole: 'worker' }),
      /MUST NOT launch/,
    );
  }
  assert.equal(typeof gate.lockdown, 'undefined');
  assert.equal(Object.prototype.hasOwnProperty.call(gate, 'lockdown'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(gate, 'vote'), false);
});

test('begin does not await a vote promise', async () => {
  let voteTouched = false;
  const hung = new Promise(() => {});
  hung.then = (...args) => {
    voteTouched = true;
    return Promise.prototype.then.apply(hung, args);
  };

  const spies = {
    vote() {
      voteTouched = true;
      return hung;
    },
    respond: {
      lockdown() { voteTouched = true; },
      reboot() { voteTouched = true; },
      secure_reboot() { voteTouched = true; },
    },
    cuda: {
      launch() { voteTouched = true; },
      memcpy() { voteTouched = true; },
    },
    afterburner: { setClock() { voteTouched = true; } },
    copyEngine: { memcpy() { voteTouched = true; } },
  };

  const gate = createGate(spies);
  const result = gate.begin({ kernel: 'gemm' }, { callerRole: 'ipc' });
  await Promise.resolve();
  assert.equal(result instanceof Promise, false);
  assert.equal(typeof result.then, 'undefined');
  assert.equal(result.ok, true);
  assert.equal(result.voted, false);
  assert.equal(result.waitedOnVote, false);
  assert.equal(voteTouched, false);
  assert.notEqual(result, hung);

  const finished = gate.end({}, { callerRole: 'ipc' });
  await Promise.resolve();
  assert.equal(finished instanceof Promise, false);
  assert.equal(typeof finished.then, 'undefined');
  assert.equal(finished.voted, false);
  assert.equal(voteTouched, false);

  // API stubs return reject envelopes (never throw, never execute).
  const voted = vote();
  assert.equal(voted.ok, false);
  assert.equal(voted.kind, 'reject');
  assert.equal(voted.voted, false);
  assert.equal(voted.executed, false);
  assert.match(voted.reason, /uncallable|complex-last/);
});

test('illegal caller denied', () => {
  assert.equal(assertCaller('begin', 'worker').ok, true);
  assert.equal(assertCaller('begin', 'ipc').ok, true);
  assert.equal(assertCaller('begin', 'gpu_gate').ok, true);
  assert.equal(assertCaller('end', 'worker').ok, true);
  assert.equal(assertCaller('end', 'ipc').ok, true);

  assert.throws(() => assertCaller('begin', 'sad'), /begin not allowed for sad/);
  assert.throws(() => assertCaller('end', 'sad'), /end not allowed for sad/);
  assert.throws(() => assertCaller('lockdown', 'sad'), /lockdown not allowed for sad/);
  assert.throws(() => assertCaller('reboot', 'sad'));
  assert.throws(() => assertCaller('secure_reboot', 'worker'));
  assert.throws(() => assertCaller('begin', 'logger'));
  assert.throws(() => assertCaller('begin', 'ntp'));
  assert.throws(() => assertCaller('end', 'isolate'));
  assert.throws(() => assertCaller('end', 'place'));

  const gate = createGate();
  assert.throws(() => gate.begin({ kernel: 'conv' }, { callerRole: 'sad' }), /begin not allowed for sad/);
  assert.throws(() => gate.end({}, { callerRole: 'sad' }), /end not allowed for sad/);
  assert.throws(
    () => gate.begin({ kernel: 'conv', call: 'lockdown' }, { callerRole: 'sad' }),
    /not allowed/,
  );
  assert.equal(Object.prototype.hasOwnProperty.call(gate, 'lockdown'), false);
  assert.equal(typeof gate.lockdown, 'undefined');
  assert.equal(typeof gate.reboot, 'undefined');
  assert.equal(typeof gate.secure_reboot, 'undefined');
});
