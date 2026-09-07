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

test('session memory survives a second turn and keeps the last specialist', () => {
  const ledger = new SessionLedger();
  const bounds = { transcriptChars: 256, factsLimit: 8 };
  const id = ledger.create({ identity: 'a', agentAlias: 'general-text-speculator', modality: {} });
  assert.equal(ledger.rememberTurn(id, {
    userText: 'My name is Ada',
    assistantText: 'Hello Ada.',
    agentAlias: 'general-text-speculator',
  }, bounds), true);
  const first = ledger.get(id, 'a');
  assert.equal(first.facts.find((fact) => fact.key === 'user_name')?.value, 'Ada');
  assert.equal(first.lastSpecialist, 'general-text-speculator');

  ledger.rememberTurn(id, {
    userText: 'what did I call myself?',
    agentAlias: 'general-text-speculator',
  }, bounds);
  const second = ledger.get(id, 'a');
  assert.equal(second.facts.find((fact) => fact.key === 'user_name')?.value, 'Ada');
  assert.match(second.transcript.map((turn) => turn.text).join('\n'), /My name is Ada/);
  assert.match(second.transcript.map((turn) => turn.text).join('\n'), /what did I call myself/);
});

test('session transcript is clipped to the declared char bound', () => {
  const ledger = new SessionLedger();
  const bounds = { transcriptChars: 40, factsLimit: 2 };
  const id = ledger.create({ identity: 'a', agentAlias: 'general-text-speculator' });
  ledger.rememberTurn(id, { userText: 'AAAAAAAAAA', assistantText: 'BBBBBBBBBB' }, bounds);
  ledger.rememberTurn(id, { userText: 'keep-me-newest', assistantText: 'tail' }, bounds);
  const text = ledger.get(id, 'a').transcript.map((turn) => `${turn.role}:${turn.text}`).join('|');
  assert.match(text, /keep-me-newest|tail/);
  const chars = ledger.get(id, 'a').transcript.reduce((n, turn) => n + turn.role.length + turn.text.length + 2, 0);
  assert.ok(chars <= 40, `transcript ${chars} exceeded bound`);
});
