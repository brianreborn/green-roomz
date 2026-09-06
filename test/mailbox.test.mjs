import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Mailbox } from '../src/mailbox.mjs';

test('push returns immediately and does not wait for drain', async () => {
  const seen = [];
  const box = new Mailbox({ onEvent: (event) => seen.push(event) });
  const t0 = performance.now();
  const published = box.push({
    kind: 'success',
    source: 'general-text-speculator',
    ticket: 's1',
    payload: { hops: ['general-text-speculator'] },
  });
  const elapsed = performance.now() - t0;
  assert.ok(elapsed < 10, `push took ${elapsed}ms`);
  assert.equal(published.ok, true);
  assert.equal(typeof published.seq, 'number');
  assert.equal(seen.length, 0, 'must not drain inline on the user path');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(seen.length, 1);
  assert.equal(seen[0].kind, 'success');
  assert.equal(seen[0].source, 'general-text-speculator');
  assert.equal(seen[0].ticket, 's1');
  assert.deepEqual(seen[0].payload, { hops: ['general-text-speculator'] });
});

test('drain sees a pushed event when autoDrain is off', () => {
  const seen = [];
  const box = new Mailbox({ autoDrain: false, onEvent: (event) => seen.push(event) });
  box.push({ kind: 'agent_unavailable', source: 'image-generation-agent', ticket: 's2' });
  assert.equal(seen.length, 0);
  const events = box.drain();
  assert.equal(events.length, 1);
  assert.equal(events[0].kind, 'agent_unavailable');
  assert.equal(seen.length, 1);
});

test('full ring drops oldest and exports stats', () => {
  const box = new Mailbox({ capacity: 4, autoDrain: false, recentLimit: 8 });
  for (let i = 0; i < 6; i += 1) {
    box.push({ kind: 'success', source: 'a', payload: { i } });
  }
  const stats = box.stats();
  assert.equal(stats.capacity, 4);
  assert.equal(stats.size, 4);
  assert.equal(stats.pushed, 6);
  assert.equal(stats.dropped, 2);
  const events = box.drain();
  assert.equal(events.length, 4);
  assert.equal(events[0].payload.i, 2);
  assert.equal(events[3].payload.i, 5);
  assert.equal(box.recent(2)[0].payload.i, 4);
});

test('long string payloads become a hash string', () => {
  const box = new Mailbox({ autoDrain: false });
  const published = box.push({ kind: 'success', source: 'a', payload: 'x'.repeat(300) });
  assert.equal(published.ok, true);
  const [event] = box.drain();
  assert.equal(typeof event.payload, 'string');
  assert.equal(event.payload.length, 64);
  assert.match(event.payload, /^[0-9a-f]{64}$/);
});

test('lockdown reboot vote kinds are not ok:true', () => {
  const box = new Mailbox({ autoDrain: false });
  for (const kind of ['lockdown', 'reboot', 'vote']) {
    const published = box.push({ kind, source: 't' });
    assert.equal(published.ok, false, kind);
    assert.equal(published.kind, 'reject');
  }
  assert.equal(box.stats().pushed, 0);
  const hop = box.push({ kind: 'hop', source: 't' });
  assert.equal(hop.ok, true);
});

test('drain snapshots the batch before listeners so listener push cannot livelock', () => {
  const box = new Mailbox({ autoDrain: false, capacity: 8 });
  let extra = 0;
  box.onEvent(() => {
    extra += 1;
    if (extra < 20) box.push({ kind: 'hop', source: 'listener' });
  });
  box.push({ kind: 'success', source: 'a' });
  box.push({ kind: 'hop', source: 'b' });
  const drained = box.drain();
  assert.equal(drained.length, 2);
  assert.ok(extra <= 2);
});
