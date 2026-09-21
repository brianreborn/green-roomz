import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeCompletionJson, sanitizeSseText } from '../src/proxy.mjs';

const upstream = {
  choices: [{
    message: { role: 'assistant', content: 'Hi' },
    logprobs: [{
      content: 'Hi',
      probs: [
        { tok_str: 'Hi', prob: 0.5 },
        { tok_str: 'Hello', prob: 0.25 },
        { tok_str: 'Hey', prob: 0.125 },
      ],
    }],
    logits: [0.1, 0.2, 0.3],
  }],
};

test('n_probs-style completion maps into OpenAI logprobs and caps top_logprobs at 20', () => {
  const out = sanitizeCompletionJson(structuredClone(upstream), {
    requestBody: { logprobs: true, top_logprobs: 2 },
  });
  const content = out.choices[0].logprobs.content;
  assert.equal(content.length, 1);
  assert.equal(content[0].token, 'Hi');
  assert.equal(content[0].top_logprobs.length, 2);
  assert.equal(content[0].top_logprobs[0].token, 'Hi');
  assert.ok(Math.abs(content[0].logprob - Math.log(0.5)) < 1e-9);
  assert.equal(out.choices[0].logits, undefined);
  assert.equal(out.obliteratus, undefined);
});

test('without logprobs the gateway drops probability dumps', () => {
  const out = sanitizeCompletionJson(structuredClone(upstream), { requestBody: { messages: [] } });
  assert.equal(out.choices[0].logprobs, undefined);
  assert.equal(out.choices[0].logits, undefined);
});

test('full logits stay behind the obliteratus flag', () => {
  const out = sanitizeCompletionJson(structuredClone(upstream), {
    requestBody: { logprobs: true, top_logprobs: 1, obliteratus: { logits: true } },
  });
  assert.deepEqual(out.obliteratus.logits, [0.1, 0.2, 0.3]);
  assert.equal(out.choices[0].logits, undefined);
});

test('streamed chunks keep per-token logprobs when requested', () => {
  const raw = `data: ${JSON.stringify({
    choices: [{
      delta: { content: 'Hi' },
      logprobs: { content: [{ token: 'Hi', logprob: -0.4, top_logprobs: [{ token: 'Hi', logprob: -0.4 }, { token: 'Yo', logprob: -1 }] }] },
    }],
  })}\n\n`;
  const text = sanitizeSseText(raw, { requestBody: { logprobs: true, top_logprobs: 1 } });
  const parsed = JSON.parse(text.replace(/^data: /, '').trim());
  assert.equal(parsed.choices[0].logprobs.content[0].token, 'Hi');
  assert.equal(parsed.choices[0].logprobs.content[0].top_logprobs.length, 1);
});
