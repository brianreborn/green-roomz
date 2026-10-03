import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SessionLedger } from '../src/sessions.mjs';

test('sessions are isolated by identity and expire', () => {
  let now = 1_000;
  const ledger = new SessionLedger({ ttlMs: 50, limit: 2, clock: () => now });
  const id = ledger.create({ identity: 'a', agentAlias: 'general-text-speculator', modality: { image: false, audio: false } });
  assert.equal(ledger.get(id, 'b'), undefined);
  assert.equal(ledger.get(id, 'a').agentAlias, 'general-text-speculator');
  now += 51;
  assert.equal(ledger.get(id, 'a'), undefined);
});

test('oldest session is evicted at the limit', () => {
  let now = 1;
  const ledger = new SessionLedger({ ttlMs: 10_000, limit: 2, clock: () => now });
  const first = ledger.create({ identity: 'a', agentAlias: 'x', modality: {} });
  now += 1;
  ledger.create({ identity: 'a', agentAlias: 'y', modality: {} });
  now += 1;
  ledger.create({ identity: 'a', agentAlias: 'z', modality: {} });
  assert.equal(ledger.get(first, 'a'), undefined);
});

test('setAgentAlias updates the stored session', () => {
  const ledger = new SessionLedger();
  const id = ledger.create({ identity: 'a', agentAlias: 'general-text-speculator', modality: {} });
  assert.equal(ledger.setAgentAlias(id, 'qwenstral-code-speculator'), true);
  assert.equal(ledger.get(id, 'a').agentAlias, 'qwenstral-code-speculator');
});
