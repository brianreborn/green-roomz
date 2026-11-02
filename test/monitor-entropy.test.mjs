import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ENVELOPE_FIELDS,
  KINDS,
  makeEnvelope,
} from '../src/monitor/api.mjs';
import {
  CORE,
  ENTROPY_CALLS,
  SOURCES,
  createEntropy,
  credit as defaultCredit,
  hash as defaultHash,
} from '../src/monitor/entropy.mjs';

const SRC = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'monitor', 'entropy.mjs'),
  'utf8',
);

function dump(value) {
  return JSON.stringify(value);
}

function assertNoRawBits(obj, secret) {
  const text = dump(obj);
  assert.equal(text.includes(secret), false, 'raw bits leaked onto envelope');
  const payload = obj.payload && typeof obj.payload === 'object' ? obj.payload : obj;
  for (const key of ['bits', 'raw', 'rawBits', 'raw_bits', 'seed', 'seedMaterial', 'bytes', 'buffer']) {
    assert.equal(key in payload, false, `${key} must not appear on mailbox payload`);
    assert.equal(key in obj, false, `${key} must not appear on envelope`);
  }
  for (const key of ['packet', 'packets', 'frame', 'frames', 'datagram', 'skb', 'workerPayload']) {
    assert.equal(key in payload, false, `${key} must not appear on mailbox payload`);
  }
}

test('credit then hash', () => {
  const core = createEntropy();
  assert.deepEqual([...ENTROPY_CALLS], ['credit', 'hash']);
  assert.deepEqual([...SOURCES], ['irq_timing', 'nic_timestamps', 'gpu_seq_jitter', 'voluntary_feed']);
  assert.deepEqual(Object.keys(core).sort(), ['credit', 'enroll', 'hash']);
  assert.equal(KINDS.includes('credit'), true);

  const credited = core.credit({
    source: 'irq_timing',
    credit: 16,
    sample: 42,
    ticket: 7,
  });
  assert.equal(credited instanceof Promise, false);
  assert.equal(typeof credited.then, 'undefined');
  assert.equal(credited.kind, 'credit');
  assert.equal(credited.payload.source, 'irq_timing');
  assert.equal(credited.payload.credit, 16);
  assert.match(credited.payload.hash, /^[0-9a-f]{64}$/);
  for (const field of ENVELOPE_FIELDS) {
    assert.equal(field in credited, true);
  }

  const hashed = core.hash();
  assert.equal(hashed instanceof Promise, false);
  assert.equal(typeof hashed.then, 'undefined');
  assert.equal(hashed.ready, true);
  assert.equal(hashed.hash, credited.payload.hash);

  const again = core.credit({ source: 'nic timestamps', credit: 8 });
  assert.equal(again.kind, 'credit');
  assert.equal(again.payload.source, 'nic_timestamps');
  assert.match(again.payload.hash, /^[0-9a-f]{64}$/);
  assert.notEqual(again.payload.hash, credited.payload.hash);
  assert.equal(core.hash().hash, again.payload.hash);

  const gpuNamed = core.credit({ source: 'gpu seq jitter', credit: 4 });
  assert.equal(gpuNamed.payload.source, 'gpu_seq_jitter');
  const vol = defaultCredit({ source: 'voluntary_feed', feed: 'ok' });
  assert.equal(vol.kind, 'credit');
  assert.equal(defaultHash().ready, true);

  const enrolled = core.enroll();
  assert.equal(enrolled.ready, true);
  assert.equal(enrolled.hash, core.hash().hash);
});

test('raw bits never appear on a fake envelope', () => {
  const core = createEntropy();
  const secret = 'super-secret-entropy-bits-do-not-ship';
  const packet = { dst: '198.51.100.1', payload: secret, bytes: [1, 2, 3] };

  const credited = core.credit({
    source: 'voluntary_feed',
    credit: 32,
    bits: secret,
    raw: secret,
    rawBits: Buffer.from(secret),
    seed: secret,
    packet,
    packets: [packet],
    frame: packet,
    workerPayload: packet,
    feed: secret,
  });

  assert.equal(credited.kind, 'credit');
  assert.equal(credited.payload.source, 'voluntary_feed');
  assert.match(credited.payload.hash, /^[0-9a-f]{64}$/);
  assertNoRawBits(credited, secret);

  const fake = makeEnvelope({
    kind: 'credit',
    source: 'sniffer',
    ticket: 99,
    payload: credited.payload,
  });
  assert.equal(fake.kind, 'credit');
  assert.deepEqual(fake.payload, { source: 'voluntary_feed', credit: 32, hash: credited.payload.hash });
  assertNoRawBits(fake, secret);
  assert.equal(dump(fake).includes(secret), false);
  assert.equal(dump(fake.payload).includes('198.51.100.1'), false);

  const workerOnly = core.credit({
    source: 'nic_timestamps',
    packet: { worker: true, payload: secret },
    sample: 1001,
  });
  assert.equal(workerOnly.payload.source, 'nic_timestamps');
  assertNoRawBits(workerOnly, secret);
  assert.equal(dump(workerOnly).includes(secret), false);
});

test('unseeded does not throw and does not call secure_reboot', () => {
  const invoked = [];
  const core = createEntropy({
    respond: {
      lockdown() { invoked.push('lockdown'); },
      reboot() { invoked.push('reboot'); },
      secure_reboot() { invoked.push('secure_reboot'); },
      secureReboot() { invoked.push('secureReboot'); },
    },
  });

  assert.doesNotThrow(() => core.hash());
  assert.doesNotThrow(() => core.enroll());
  const hashed = core.hash({ call: 'secure_reboot' });
  assert.equal(hashed.ready, false);
  assert.equal('hash' in hashed, false);
  const delayed = core.enroll();
  assert.equal(delayed.ready, false);
  assert.equal(delayed instanceof Promise, false);
  assert.equal(invoked.length, 0);
  assert.equal(invoked.includes('secure_reboot'), false);

  assert.equal(Object.prototype.hasOwnProperty.call(core, 'lockdown'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(core, 'reboot'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(core, 'secure_reboot'), false);
  assert.equal(typeof core.secure_reboot, 'undefined');
  assert.equal(typeof core.secureReboot, 'undefined');

  const seeded = core.credit({ source: 'irq_timing', credit: 1 });
  assert.equal(seeded.kind, 'credit');
  assert.equal(core.hash().ready, true);
  assert.equal(core.enroll().ready, true);
  assert.equal(invoked.length, 0);
});

test('no GPU path imported', () => {
  assert.equal(CORE.mixer, 'fortuna');
  assert.equal(CORE.cpu, true);
  assert.equal(CORE.gpu, false);
  assert.equal(CORE.on8600, false);
  assert.equal(CORE.yarrow, false);
  assert.equal(CORE.cudaLaunch, false);
  assert.equal(CORE.cuda, false);
  assert.equal(CORE.device, 'cpu');

  const importLines = SRC.split(/\r?\n/).filter((line) => /^\s*import\s/.test(line));
  assert.ok(importLines.some((line) => line.includes('./api.mjs')));
  for (const line of importLines) {
    assert.doesNotMatch(line, /cuda|gate|gpu|yarrow|8600/i);
  }
  assert.doesNotMatch(SRC, /from\s+['"][^'"]*(cuda|gate|gpu)/i);
  assert.equal(SRC.includes('createGate'), false);
  assert.equal(typeof createEntropy().begin, 'undefined');
});
