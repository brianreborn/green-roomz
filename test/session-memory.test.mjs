import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyTurn,
  clipMessages,
  clipTranscript,
  contextCharBudget,
  extractFacts,
  formatWorkingSet,
  injectWorkingSet,
  MEMORY_BLOCK_MARKER,
} from '../src/session-memory.mjs';
import { prepareInferenceBody } from '../src/gateway.mjs';
import { SessionLedger } from '../src/sessions.mjs';

test('extractFacts captures a user name and ignores filler', () => {
  assert.deepEqual(extractFacts('My name is Ada'), [{ key: 'user_name', value: 'Ada', origin: 'user' }]);
  assert.equal(extractFacts('I am going to the store').length, 0);
});

test('clipTranscript keeps the newest turns under the bound', () => {
  const clipped = clipTranscript([
    { role: 'user', text: 'old fact that should drop' },
    { role: 'assistant', text: 'old reply' },
    { role: 'user', text: 'newest' },
  ], 20);
  const blob = clipped.map((turn) => turn.text).join(' ');
  assert.match(blob, /newest/);
  assert.equal(clipped.reduce((n, turn) => n + `${turn.role}: ${turn.text}`.length, 0) <= 20 + clipped.length, true);
});

test('injectWorkingSet feeds prior facts into the next turn without blowing 4096 ctx', () => {
  const state = applyTurn(null, {
    userText: 'My name is Ada',
    assistantText: 'Hello Ada.',
    agentAlias: 'general-text-speculator',
  }, { transcriptChars: 2048, factsLimit: 8 });
  const messages = injectWorkingSet(
    [{ role: 'user', content: 'what did I call myself?' }],
    state,
    { maxChars: contextCharBudget({ context_size: 4096 }, { maxTokens: 96, systemChars: 0 }) },
  );
  const blob = messages.map((message) => String(message.content)).join('\n');
  assert.match(blob, /Ada/);
  assert.match(blob, new RegExp(MEMORY_BLOCK_MARKER.replace(/[()]/g, '\\$&')));
  assert.match(blob, /last specialist: general-text-speculator/);
  assert.match(blob, /what did I call myself/);
});

test('a huge history is clipped to the context budget', () => {
  const history = [];
  for (let i = 0; i < 80; i += 1) history.push({ role: i % 2 === 0 ? 'user' : 'assistant', content: `turn ${i} ${'x'.repeat(200)}` });
  const clipped = clipMessages(history, 800);
  const chars = clipped.reduce((n, message) => n + String(message.content ?? '').length, 0);
  assert.ok(chars <= 800, `clipped ${chars} chars`);
  assert.match(String(clipped.at(-1)?.content), /turn 79/);
  assert.ok(clipped.length < history.length);
});

test('prepareInferenceBody injects session memory on the next turn', () => {
  const ledger = new SessionLedger();
  const bounds = { transcriptChars: 2048, factsLimit: 8 };
  const id = ledger.create({ identity: 'loopback-dev', agentAlias: 'general-text-speculator' });
  ledger.rememberTurn(id, { userText: 'My name is Ada', assistantText: 'Hi Ada', agentAlias: 'general-text-speculator' }, bounds);
  const agent = { alias: 'general-text-speculator', context_size: 4096 };
  const payload = prepareInferenceBody(
    { messages: [{ role: 'user', content: 'what did I call myself?' }] },
    agent,
    { session: ledger.workingSet(id) },
  );
  const blob = payload.messages.map((message) => String(message.content)).join('\n');
  assert.match(blob, /Ada/);
  assert.match(blob, /what did I call myself/);
});

test('formatWorkingSet is empty when there is nothing to recall', () => {
  assert.equal(formatWorkingSet({ facts: [], transcript: [], lastSpecialist: null }), '');
});
