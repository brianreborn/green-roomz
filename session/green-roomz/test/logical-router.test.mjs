import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planRoute } from '../src/logical-router.mjs';

test('C++ program matches code_intent even without a trailing word boundary on ++', () => {
  const plan = planRoute({ messages: [{ role: 'user', content: 'generate a small limerick-like C++ program' }] });
  assert.equal(plan.route, 'qwenstral-code-speculator');
  assert.equal(plan.reason_code, 'code_intent');
});

test('python function matches code_intent', () => {
  const plan = planRoute({ messages: [{ role: 'user', content: 'write a python function that returns 1' }] });
  assert.equal(plan.reason_code, 'code_intent');
});

test('explicit translate is not code even if the text mentions a function', () => {
  const plan = planRoute({ messages: [{ role: 'user', content: 'Please translate this function into French' }] });
  assert.equal(plan.route, 'general-text-speculator');
  assert.equal(plan.reason_code, 'translation_request');
});

test('render/calligraphy is image generation intent', () => {
  const plan = planRoute({ messages: [{ role: 'user', content: 'Could you render this as a scroll with lovely calligraphy and an illuminated letter?' }] });
  assert.equal(plan.route, 'image-generation-agent');
  assert.equal(plan.reason_code, 'image_generation_intent');
});
