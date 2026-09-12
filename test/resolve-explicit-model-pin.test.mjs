import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  hardRuleRoute,
  isAutoModelId,
  isRouterSentinel,
  resolveExplicitModelPin,
} from '../src/routing.mjs';
import { UnavailableError, ValidationError } from '../src/errors.mjs';

/** Minimal registry stand-in — no full AgentRegistry dependency. */
function mockRegistry(states = {}) {
  const agents = new Map();
  const defaults = {
    'tool-router-agent': 'ready',
    'general-text-speculator': 'ready',
    'qwenstral-code-speculator': 'ready',
    'speech-synthesis-agent': 'unavailable',
    'image-generation-agent': 'unavailable',
    'vision-layout-agent': 'ready',
    'audio-transcription-agent': 'ready',
    'semantic-embedding-agent': 'ready',
    'retrieval-rerank-agent': 'ready',
    'safety-policy-agent': 'ready',
  };
  const merged = { ...defaults, ...states };
  for (const [alias, state] of Object.entries(merged)) {
    agents.set(alias, { alias, state });
  }
  return {
    agents,
    get(alias) {
      return agents.get(alias) ?? null;
    },
    status(alias) {
      const row = agents.get(alias);
      if (!row) return { state: 'unavailable', missing: ['unknown'] };
      return {
        state: row.state,
        missing: row.state === 'unavailable' ? [`model:${alias}`] : [],
      };
    },
  };
}

test('isRouterSentinel: auto and tool-router only — unknown is NOT a sentinel', () => {
  const reg = mockRegistry();
  assert.equal(isRouterSentinel(null, reg), true);
  assert.equal(isRouterSentinel('auto', reg), true);
  assert.equal(isRouterSentinel('tool-router-agent', reg), true);
  assert.equal(isRouterSentinel('code-agent', reg), false);
  assert.equal(isRouterSentinel('general-text-agent', reg), false);
  assert.equal(isRouterSentinel('speech-synthesis-agent', reg), false);
});

test('isAutoModelId accepts intentional auto / compat ids', () => {
  assert.equal(isAutoModelId(null), true);
  assert.equal(isAutoModelId(''), true);
  assert.equal(isAutoModelId('auto'), true);
  assert.equal(isAutoModelId('tool-router-agent'), true);
  assert.equal(isAutoModelId('gpt-4o'), true);
  assert.equal(isAutoModelId('speech-synthesis-agent'), false);
  assert.equal(isAutoModelId('code-agent'), false);
});

test('P0: unknown alias code-agent → ValidationError 400 (not nexus)', () => {
  const reg = mockRegistry();
  assert.throws(
    () => resolveExplicitModelPin('code-agent', reg),
    (err) => err instanceof ValidationError
      && err.status === 400
      && /Unknown agent alias: code-agent/.test(err.message)
      && Array.isArray(err.details?.allowed),
  );
});

test('P0: wrong alias general-text-agent → ValidationError 400', () => {
  const reg = mockRegistry();
  assert.throws(
    () => resolveExplicitModelPin('general-text-agent', reg),
    ValidationError,
  );
});

test('P0: unavailable speech-synthesis-agent → pin (gateway will 503)', () => {
  const reg = mockRegistry({ 'speech-synthesis-agent': 'unavailable' });
  const pin = resolveExplicitModelPin('speech-synthesis-agent', reg);
  assert.deepEqual(pin, {
    decision: 'pin',
    alias: 'speech-synthesis-agent',
    reason: 'requested_alias',
  });
});

test('P0: unavailable image-generation-agent → pin (preserve FUZZ-DRAW-503 pattern)', () => {
  const reg = mockRegistry({ 'image-generation-agent': 'unavailable' });
  const pin = resolveExplicitModelPin('image-generation-agent', reg);
  assert.equal(pin.decision, 'pin');
  assert.equal(pin.alias, 'image-generation-agent');
});

test('intentional auto / tool-router → nexus (do not break /auto)', () => {
  const reg = mockRegistry();
  assert.deepEqual(resolveExplicitModelPin('auto', reg), { decision: 'nexus' });
  assert.deepEqual(resolveExplicitModelPin('tool-router-agent', reg), { decision: 'nexus' });
  assert.deepEqual(resolveExplicitModelPin(null, reg), { decision: 'nexus' });
});

test('available specialist without lock_alias → nexus (llama.app sticky ignore)', () => {
  const reg = mockRegistry({ 'qwenstral-code-speculator': 'ready' });
  assert.deepEqual(
    resolveExplicitModelPin('qwenstral-code-speculator', reg),
    { decision: 'nexus' },
  );
});

test('available specialist with lock_alias → pin', () => {
  const reg = mockRegistry({ 'qwenstral-code-speculator': 'ready' });
  assert.deepEqual(
    resolveExplicitModelPin('qwenstral-code-speculator', reg, { lockAlias: true }),
    { decision: 'pin', alias: 'qwenstral-code-speculator', reason: 'lock_alias' },
  );
});

test('hardRuleRoute: unknown model throws before nexus fallthrough', () => {
  const reg = mockRegistry();
  assert.throws(
    () => hardRuleRoute({
      model: 'code-agent',
      messages: [{ role: 'user', content: 'write hello' }],
    }, reg),
    ValidationError,
  );
});

test('hardRuleRoute: unavailable speech pin — not null nexus', () => {
  const reg = mockRegistry({ 'speech-synthesis-agent': 'unavailable' });
  const routed = hardRuleRoute({
    model: 'speech-synthesis-agent',
    messages: [{ role: 'user', content: 'say hi' }],
  }, reg);
  assert.equal(routed.effectiveAlias, 'speech-synthesis-agent');
  assert.equal(routed.reason, 'requested_alias');
});

test('hardRuleRoute: /auto still forces nexus even with sticky model', () => {
  const reg = mockRegistry();
  const routed = hardRuleRoute({
    model: 'speech-synthesis-agent',
    messages: [{ role: 'user', content: '/auto hello' }],
  }, reg);
  assert.equal(routed.effectiveAlias, null);
  assert.equal(routed.reason, 'nexus');
});

test('hardRuleRoute: /draw pins image-gen (503 path when unavailable)', () => {
  const reg = mockRegistry({ 'image-generation-agent': 'unavailable' });
  const routed = hardRuleRoute({
    model: 'auto',
    messages: [{ role: 'user', content: '/draw a red apple' }],
  }, reg);
  assert.equal(routed.effectiveAlias, 'image-generation-agent');
  assert.equal(routed.reason, 'slash_draw');
});

/** Mirrors gateway handleChatTurn first-hop unavailable check. */
function gatewayWouldStatus(routed, registry) {
  if (!routed.effectiveAlias) return { status: 200, via: 'nexus' };
  const state = registry.status(routed.effectiveAlias).state;
  if (state === 'unavailable') {
    const err = new UnavailableError(
      `${routed.effectiveAlias} is unavailable`,
      registry.status(routed.effectiveAlias).missing,
    );
    return { status: err.status, code: err.code, via: 'pin' };
  }
  return { status: 200, via: 'pin' };
}

test('gateway mapping: unavailable speech pin → 503 agent_unavailable', () => {
  const reg = mockRegistry({ 'speech-synthesis-agent': 'unavailable' });
  const routed = hardRuleRoute({
    model: 'speech-synthesis-agent',
    messages: [{ role: 'user', content: 'hi' }],
  }, reg);
  const mapped = gatewayWouldStatus(routed, reg);
  assert.equal(mapped.status, 503);
  assert.equal(mapped.code, 'agent_unavailable');
});

test('gateway mapping: unknown model never maps to 200 tool-router', () => {
  const reg = mockRegistry();
  assert.throws(
    () => hardRuleRoute({
      model: 'general-text-agent',
      messages: [{ role: 'user', content: 'hi' }],
    }, reg),
    (err) => err instanceof ValidationError && err.status === 400,
  );
});
