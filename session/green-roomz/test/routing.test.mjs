import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AgentRegistry } from '../src/registry.mjs';
import {
  routeRequest,
  isExplicitTranslationRequest,
  latestUserMessageText,
  hardRuleRoute,
} from '../src/routing.mjs';
import { ValidationError } from '../src/errors.mjs';
import { sampleManifest } from './helpers.mjs';

function registry() {
  return new AgentRegistry(sampleManifest());
}

test('image input overrides to vision-layout-agent', () => {
  const routed = routeRequest({
    model: 'general-text-speculator',
    messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,xxxx' } }] }],
  }, registry());
  assert.equal(routed.effectiveAlias, 'vision-layout-agent');
  assert.equal(routed.reason, 'image_input');
});

test('audio input overrides to audio-transcription-agent', () => {
  const routed = routeRequest({
    model: 'general-text-speculator',
    messages: [{ role: 'user', content: [{ type: 'input_audio', input_audio: { data: 'data:audio/wav;base64,xxxx' } }] }],
  }, registry());
  assert.equal(routed.effectiveAlias, 'audio-transcription-agent');
});

test('mixed image and audio is rejected', () => {
  assert.throws(() => routeRequest({
    messages: [{ role: 'user', content: [
      { type: 'image_url', image_url: { url: 'data:image/png;base64,x' } },
      { type: 'input_audio', input_audio: { data: 'data:audio/wav;base64,x' } },
    ] }],
  }, registry()), ValidationError);
});

test('text-only turns do not regex C++ or image intent; nexus decides', () => {
  const routed = routeRequest({
    model: 'qwenstral-code-speculator',
    messages: [
      { role: 'user', content: 'write a C++ program about a hero' },
      { role: 'assistant', content: '#include <iostream>' },
      { role: 'user', content: 'Can you show me an image of how that hero might look?' },
    ],
  }, registry());
  assert.equal(routed.effectiveAlias, null);
  assert.equal(routed.reason, 'nexus');
});

test('lock_alias honors the requested specialist', () => {
  const routed = hardRuleRoute({
    lock_alias: true,
    model: 'qwenstral-code-speculator',
    messages: [{ role: 'user', content: 'hello' }],
  }, registry());
  assert.equal(routed.effectiveAlias, 'qwenstral-code-speculator');
  assert.equal(routed.reason, 'lock_alias');
});

test('latest user message ignores the earlier C++ transcript', () => {
  const text = latestUserMessageText({
    messages: [
      { role: 'user', content: 'write a C++ program' },
      { role: 'assistant', content: 'int main() {}' },
      { role: 'user', content: 'Can you show me an image of how that hero might look?' },
    ],
  });
  assert.equal(text, 'Can you show me an image of how that hero might look?');
  assert.equal(text.includes('C++'), false);
});

test('translation is not inferred from foreign-looking text', () => {
  assert.equal(isExplicitTranslationRequest({ messages: [{ role: 'user', content: 'Bonjour, comment ça va?' }] }), false);
  assert.equal(isExplicitTranslationRequest({ messages: [{ role: 'user', content: 'Please translate this to English' }] }), true);
});
