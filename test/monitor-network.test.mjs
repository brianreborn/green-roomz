import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  canTransition,
  applyTransition,
} from '../src/monitor/api.mjs';
import {
  createNetwork,
  isImplemented,
  targetKind,
} from '../src/monitor/network.mjs';

test('lockdown(eth0) reject', () => {
  const invoked = [];
  const net = createNetwork({
    respond: {
      lockdown() { invoked.push('lockdown'); },
      reboot() { invoked.push('reboot'); },
      secure_reboot() { invoked.push('secure_reboot'); },
    },
  });
  const result = net.lockdown('eth0');
  assert.equal(result.kind, 'reject');
  assert.equal(result.ok, false);
  assert.equal(result.voted, false);
  assert.equal(result.implemented, false);
  assert.match(result.reason, /machine-only/);
  assert.equal(invoked.length, 0, 'lockdown must never execute');
  const machine = net.lockdown('machine');
  assert.equal(machine.ok, false);
  assert.equal(machine.executed, false);
  assert.equal(machine.kind, 'reject');
  assert.equal(invoked.length, 0);
});

test('secure_reboot(all-nics) reject', () => {
  const invoked = [];
  const net = createNetwork({
    respond: {
      secure_reboot() { invoked.push('secure_reboot'); },
    },
  });
  const result = net.secure_reboot('all-nics');
  assert.equal(result.kind, 'reject');
  assert.equal(result.ok, false);
  assert.equal(result.voted, false);
  assert.match(result.reason, /machine-only/);
  assert.equal(invoked.length, 0);
});

test('freeze then sleep reject', () => {
  assert.equal(canTransition('frozen', 'sleep'), false);
  assert.equal(canTransition('sleep', 'frozen'), false);
  const graph = applyTransition('frozen', 'sleep', 'eth0');
  assert.equal(graph.ok, false);
  assert.equal(graph.reject.kind, 'reject');

  const net = createNetwork();
  const freeze = net.apply('freeze', 'eth0');
  assert.equal(freeze.implemented, false);
  const result = net.apply('sleep', 'eth0');
  assert.equal(result.kind, 'reject');
  assert.equal(result.ok, false);
  assert.equal(result.from, 'frozen');
  assert.equal(result.to, 'sleep');
  assert.equal(result.voted, false);
  assert.match(result.reason, /illegal/);
  const again = net.apply('sleep', 'eth0');
  assert.equal(again, result);
  assert.equal(again.voted, false);
});

test('down(ifX) allowed as symbol', () => {
  const net = createNetwork();
  assert.equal(targetKind('eth0'), 'ifX');
  assert.equal(isImplemented('down', 'eth0'), true);
  assert.equal(isImplemented('up', 'wlan0'), true);
  const result = net.down('eth0');
  assert.equal(result.ok, true);
  assert.equal(result.implemented, true);
  assert.equal(result.state, 'down');
  assert.equal(result.verb, 'down');
  assert.equal(result.target, 'eth0');
  const machine = net.down('machine');
  assert.equal(machine.kind, 'reject');
  assert.match(machine.reason, /ifX-only/);
});

test('halt(machine) reject', () => {
  const net = createNetwork();
  const result = net.halt('machine');
  assert.equal(result.kind, 'reject');
  assert.equal(result.ok, false);
  assert.equal(result.implemented, false);
  assert.equal(result.voted, false);
  assert.match(result.reason, /v1-illegal|ifX-only/);
});

test('encrypt-volumes is out_of_v1; missing capability rejects', () => {
  const net = createNetwork();
  const enc = net.apply('encrypt-volumes', 'machine');
  assert.equal(enc.kind, 'reject');
  assert.match(enc.reason, /out_of_v1/);
  const capped = createNetwork({ capabilities: [] });
  const miss = capped.down('eth0');
  assert.equal(miss.kind, 'reject');
  assert.match(miss.reason, /missing capability/);
  assert.notEqual(miss.ok, true);
});

test('reset while resetting rejects; mid-reset is not frozen', () => {
  const net = createNetwork();
  const first = net.reset('eth0');
  assert.equal(first.implemented, false);
  assert.equal(first.kind, 'reject');
  assert.notEqual(first.from, 'frozen');
  const second = net.reset('eth0');
  assert.equal(second.kind, 'reject');
  assert.match(second.reason, /reset already in progress|illegal/);
  assert.notEqual(second.to, 'frozen');
});
