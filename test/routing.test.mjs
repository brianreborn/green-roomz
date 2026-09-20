import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AgentRegistry } from '../src/registry.mjs';
import {
  routeRequest,
  isExplicitTranslationRequest,
  latestUserMessageText,
  hardRuleRoute,
  isGenericChatRequest,
  parseCouncilArgs,
  parseSlashCommand,
  stripSlashCommand,
  aliasCanAdmit,
  availableAliases,
  detectModalities,
} from '../src/routing.mjs';
import { nexusCandidateAliases } from '../src/nexus.mjs';
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

test('mixed image and audio goes to nexus instead of throwing', () => {
  const routed = routeRequest({
    messages: [{ role: 'user', content: [
      { type: 'image_url', image_url: { url: 'data:image/png;base64,x' } },
      { type: 'input_audio', input_audio: { data: 'data:audio/wav;base64,x' } },
    ] }],
  }, registry());
  assert.equal(routed.effectiveAlias, null);
  assert.equal(routed.reason, 'nexus');
  assert.equal(routed.modality.image, true);
  assert.equal(routed.modality.audio, true);
});

test('/vision without an image part is rejected', () => {
  assert.throws(() => routeRequest({
    messages: [{ role: 'user', content: '/vision describe this' }],
  }, registry()), ValidationError);
});

test('/audio without an audio part is rejected', () => {
  assert.throws(() => routeRequest({
    messages: [{ role: 'user', content: '/audio transcribe this' }],
  }, registry()), ValidationError);
});

test('/router pins the resident nexus', () => {
  const routed = hardRuleRoute({
    model: 'general-text-speculator',
    messages: [{ role: 'user', content: '/router what are you' }],
  }, registry());
  assert.equal(routed.effectiveAlias, 'tool-router-agent');
  assert.equal(routed.reason, 'slash_router');
});

test('/tts pins speech-synthesis-agent on the chat path', () => {
  const routed = hardRuleRoute({
    messages: [{ role: 'user', content: '/tts say hello' }],
  }, registry());
  assert.equal(routed.effectiveAlias, 'speech-synthesis-agent');
  assert.equal(routed.reason, 'slash_tts');
});

test('unavailable native model is still pinned so completions can 503', () => {
  const reg = registry();
  reg.setStatus('image-generation-agent', 'unavailable', { missing: ['model:missing'] });
  const routed = hardRuleRoute({
    model: 'image-generation-agent',
    messages: [{ role: 'user', content: 'a red apple' }],
  }, reg);
  assert.equal(routed.effectiveAlias, 'image-generation-agent');
  assert.equal(routed.reason, 'requested_alias');
});

test('unavailable qwenstral-code-speculator is not pinned as requested_alias', () => {
  const reg = registry();
  reg.setStatus('qwenstral-code-speculator', 'unavailable', { missing: ['impractical:RAM'] });
  const routed = hardRuleRoute({
    model: 'qwenstral-code-speculator',
    messages: [{ role: 'user', content: 'write hello' }],
  }, reg);
  assert.equal(routed.effectiveAlias, null);
  assert.equal(routed.reason, 'nexus');
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

test('generic ChatGPT-compat model ids are not llama.app pins', () => {
  assert.equal(isGenericChatRequest({}), true);
  assert.equal(isGenericChatRequest({ model: 'general-text-speculator' }), true);
  assert.equal(isGenericChatRequest({ model: 'gpt-4o' }), true);
  assert.equal(isGenericChatRequest({ model: 'qwenstral-code-speculator' }), false);
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

test('requested security-monitor-agent pins to mailbox without nexus', () => {
  const routed = hardRuleRoute({
    model: 'security-monitor-agent',
    messages: [{ role: 'user', content: 'snapshot' }],
  }, registry());
  assert.equal(routed.effectiveAlias, 'security-monitor-agent');
  assert.equal(routed.reason, 'mailbox');
});

test('lock_alias can pin the resident nexus', () => {
  const reg = registry();
  reg.setStatus('tool-router-agent', 'ready');
  const routed = hardRuleRoute({
    lock_alias: true,
    model: 'tool-router-agent',
    messages: [{ role: 'user', content: 'ping' }],
  }, reg);
  assert.equal(routed.effectiveAlias, 'tool-router-agent');
  assert.equal(routed.reason, 'lock_alias');
});

test('plain text does not hard-route to vision-layout-agent', () => {
  const body = { messages: [{ role: 'user', content: 'hello there, how are you' }] };
  const routed = hardRuleRoute(body, registry());
  assert.equal(routed.effectiveAlias, null);
  assert.equal(routed.reason, 'nexus');
  assert.equal(detectModalities(body).image, false);
  assert.notEqual(routed.effectiveAlias, 'vision-layout-agent');
});

test('/code slash pins qwenstral-code-speculator even when the model is general-text', () => {
  const routed = hardRuleRoute({
    model: 'general-text-speculator',
    messages: [{ role: 'user', content: '/code write hello' }],
  }, registry());
  assert.equal(routed.effectiveAlias, 'qwenstral-code-speculator');
  assert.equal(routed.reason, 'slash_code');
  const parsed = parseSlashCommand({ messages: [{ role: 'user', content: '/code write hello' }] });
  assert.equal(parsed.token, 'code');
  assert.equal(parsed.alias, 'qwenstral-code-speculator');
  const stripped = stripSlashCommand({ messages: [{ role: 'user', content: '/code write hello' }] });
  assert.equal(stripped.messages[0].content, 'write hello');
});

test('/text slash pins general-text-speculator even on a python prompt', () => {
  const routed = hardRuleRoute({
    model: 'qwenstral-code-speculator',
    messages: [{ role: 'user', content: '/text write a python function named hello' }],
  }, registry());
  assert.equal(routed.effectiveAlias, 'general-text-speculator');
  assert.equal(routed.reason, 'slash_text');
});

test('slash inside a fence is not an operator switch', () => {
  const routed = hardRuleRoute({
    messages: [{ role: 'user', content: '```\n/code sneak\n```\njust a poem' }],
  }, registry());
  assert.equal(routed.effectiveAlias, null);
  assert.equal(routed.reason, 'nexus');
  assert.equal(parseSlashCommand({ messages: [{ role: 'user', content: '```\n/code sneak\n```' }] }), null);
});

test('impractical aliases are skipped by availableAliases and aliasCanAdmit', () => {
  const reg = registry();
  reg.setStatus('qwenstral-code-speculator', 'unavailable', { missing: ['impractical:RAM'] });
  assert.equal(aliasCanAdmit(reg, 'qwenstral-code-speculator'), false);
  assert.equal(availableAliases(reg).includes('qwenstral-code-speculator'), false);
});

test('nexus candidates omit vision and audio on plain text', () => {
  const reg = registry();
  for (const alias of reg.agents.keys()) reg.setStatus(alias, 'ready');
  const names = nexusCandidateAliases(reg, new Set(), { messages: [{ role: 'user', content: 'hello' }] });
  assert.equal(names.includes('vision-layout-agent'), false);
  assert.equal(names.includes('audio-transcription-agent'), false);
  assert.equal(names.includes('security-monitor-agent'), false);
  assert.equal(names.includes('speech-synthesis-agent'), false);
  assert.equal(names.includes('semantic-embedding-agent'), false);
  assert.equal(names.includes('image-generation-agent'), false);
  assert.equal(names.includes('retrieval-rerank-agent'), false);
});

test('stripSlashCommand replaces array text parts', () => {
  const stripped = stripSlashCommand({
    messages: [
      { role: 'assistant', content: 'prior' },
      { role: 'user', content: [{ type: 'text', text: '/text hello' }, { type: 'text', text: 'keep' }] },
    ],
  });
  assert.equal(stripped.messages[1].content[0].text, 'hello');
  assert.equal(stripped.messages[1].content[1].text, 'keep');
});

test('/council on|off toggles a session default; on + prompt also runs this turn', () => {
  const on = parseSlashCommand({ messages: [{ role: 'user', content: '/council on vision-layout-agent similarity' }] });
  assert.equal(on.setting, 'council');
  assert.deepEqual(on.councilDefault, { targets: ['vision-layout-agent'], judge: 'similarity', parallel: undefined });
  assert.equal(on.settingOnly, true);
  assert.equal(on.council, undefined);

  const onRun = parseSlashCommand({ messages: [{ role: 'user', content: '/council on code refactor it' }] });
  assert.equal(onRun.councilDefault.targets[0], 'qwenstral-code-speculator');
  assert.deepEqual(onRun.council.targets, ['qwenstral-code-speculator']);
  assert.equal(onRun.rest, 'refactor it');

  const off = parseSlashCommand({ messages: [{ role: 'user', content: '/council off' }] });
  assert.equal(off.setting, 'council');
  assert.equal(off.councilDefault, null);
  assert.equal(off.council, undefined);
});

test('parseCouncilArgs: pulls targets / judge / parallelism off the front, leaves the prompt', () => {
  assert.deepEqual(parseCouncilArgs('vision-layout-agent similarity what brand is this'),
    { targets: ['vision-layout-agent'], judge: 'similarity', parallel: undefined, rest: 'what brand is this' });
  assert.deepEqual(parseCouncilArgs('code,general-text-speculator serial refactor it'),
    { targets: ['qwenstral-code-speculator', 'general-text-speculator'], judge: null, parallel: false, rest: 'refactor it' });
  assert.deepEqual(parseCouncilArgs('extract the label fields as JSON'),
    { targets: null, judge: null, parallel: undefined, rest: 'extract the label fields as JSON' });
  assert.deepEqual(parseCouncilArgs('field-vote read this'),
    { targets: null, judge: 'field-vote', parallel: undefined, rest: 'read this' });
});

test('parseSlashCommand: /council carries a council spec and strips to the prompt', () => {
  const p = parseSlashCommand({ messages: [{ role: 'user', content: '/council vision-layout-agent similarity what is this' }] });
  assert.equal(p.token, 'council');
  assert.deepEqual(p.council, { targets: ['vision-layout-agent'], judge: 'similarity', parallel: undefined });
  assert.equal(p.rest, 'what is this');
  const stripped = stripSlashCommand({ messages: [{ role: 'user', content: '/council code refactor this' }] });
  assert.equal(stripped.messages[0].content, 'refactor this');
});

test('model "auto" / OpenAI ids route via the nexus instead of pinning', () => {
  for (const model of ['auto', 'green-roomz', 'gpt-4o', 'default']) {
    const r = routeRequest({ model, messages: [{ role: 'user', content: 'hi' }] }, registry());
    assert.equal(r.reason, 'nexus', `${model} should be nexus-routed`);
  }
});

test('model "tool-router-agent" without lock_alias is nexus-routed, not pinned to the 0.5B', () => {
  const r = routeRequest({ model: 'tool-router-agent', messages: [{ role: 'user', content: 'hi' }] }, registry());
  assert.equal(r.reason, 'nexus');
  const pinned = routeRequest({ model: 'tool-router-agent', lock_alias: true, messages: [{ role: 'user', content: 'hi' }] }, registry());
  assert.equal(pinned.effectiveAlias, 'tool-router-agent');
});

test('security slash dispatches route to their corresponding specialists', () => {
  const reg = registry();
  
  // Code security & SAST -> qwenstral-code-speculator
  const sast = hardRuleRoute({ messages: [{ role: 'user', content: '/sast check buffer overflow' }] }, reg);
  assert.equal(sast.effectiveAlias, 'qwenstral-code-speculator');
  assert.equal(sast.reason, 'slash_sast');

  const audit = hardRuleRoute({ messages: [{ role: 'user', content: '/audit review auth handler' }] }, reg);
  assert.equal(audit.effectiveAlias, 'qwenstral-code-speculator');
  assert.equal(audit.reason, 'slash_audit');

  // Threat modeling & OSINT -> general-text-speculator
  const threat = hardRuleRoute({ messages: [{ role: 'user', content: '/threatmodel STRIDE analysis of gateway' }] }, reg);
  assert.equal(threat.effectiveAlias, 'general-text-speculator');
  assert.equal(threat.reason, 'slash_threatmodel');

  const osint = hardRuleRoute({ messages: [{ role: 'user', content: '/osint summarize attack surface' }] }, reg);
  assert.equal(osint.effectiveAlias, 'general-text-speculator');
  assert.equal(osint.reason, 'slash_osint');

  // Detection rules -> qwenstral-code-speculator
  const rules = hardRuleRoute({ messages: [{ role: 'user', content: '/sigma generate rule for lolbin' }] }, reg);
  assert.equal(rules.effectiveAlias, 'qwenstral-code-speculator');
  assert.equal(rules.reason, 'slash_sigma');

  // Monitor -> security-monitor-agent
  const mon = hardRuleRoute({ messages: [{ role: 'user', content: '/monitor snapshot' }] }, reg);
  assert.equal(mon.effectiveAlias, 'security-monitor-agent');
  assert.equal(mon.reason, 'slash_monitor');
});

