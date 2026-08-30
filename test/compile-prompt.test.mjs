import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  stockPromptLayers,
  compileStockPrompt,
  compileManifestPrompts,
  sha256,
} from '../src/compile-prompt.mjs';
import { loadManifest, loadDeclaredKernel } from '../src/config.mjs';
import { MICROKERNEL_MAX_CHARS } from '../src/constants.mjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

test('stockPromptLayers: kernel-only for nexus and the critical agents', () => {
  assert.deepEqual(stockPromptLayers('tool-router-agent'), []);
  assert.deepEqual(stockPromptLayers('safety-policy-agent'), []);
  assert.deepEqual(stockPromptLayers('security-monitor-agent'), []);
});

test('stockPromptLayers: MFL on the cognitive agents, handoff on the narrow-job agents', () => {
  assert.deepEqual(stockPromptLayers('general-text-speculator'), ['agency', 'memory-feedback-loop', 'confidence']);
  assert.deepEqual(stockPromptLayers('qwenstral-code-speculator'), ['agency', 'memory-feedback-loop', 'confidence', 'handoff']);
  assert.deepEqual(stockPromptLayers('vision-layout-agent'), ['agency', 'confidence', 'handoff']);
  assert.deepEqual(stockPromptLayers('audio-transcription-agent'), ['agency', 'confidence', 'handoff']);
  assert.deepEqual(stockPromptLayers('image-generation-agent'), ['agency', 'confidence', 'handoff']);
});

test('compileStockPrompt requires kernel text', () => {
  assert.throws(() => compileStockPrompt('general-text-speculator', {}), /kernelText is required/);
  assert.throws(() => compileStockPrompt('general-text-speculator', { kernelText: '   ' }), /kernelText is required/);
});

test('compileStockPrompt: nexus prompt is the kernel alone, CRLF-normalized, bound-checked', () => {
  const out = compileStockPrompt('tool-router-agent', { kernelText: 'route only\r\nsecond line\r\n' });
  assert.equal(out, 'route only\nsecond line\n');
  assert.ok(out.length <= MICROKERNEL_MAX_CHARS);
});

test('compileStockPrompt: an over-long nexus kernel is rejected (assertNexusKernelText propagates)', () => {
  assert.throws(
    () => compileStockPrompt('tool-router-agent', { kernelText: 'x'.repeat(MICROKERNEL_MAX_CHARS + 1) }),
    /size bound/,
  );
});

test('compileStockPrompt: general-text stacks agency, memory, confidence, then the kernel in order', () => {
  const out = compileStockPrompt('general-text-speculator', { kernelText: '# general-text-speculator\n\nhelp the user.' });
  const iAgency = out.indexOf('# Green-Roomz agent');
  const iMem = out.indexOf('# Memory');
  const iConf = out.indexOf('# Confidence');
  const iKernel = out.indexOf('# general-text-speculator');
  assert.ok(iAgency >= 0 && iMem > iAgency && iConf > iMem && iKernel > iConf, out);
  assert.match(out, /derivation.*attention.*integration.*partition.*containment.*disintegration/s);
  assert.ok(out.endsWith('help the user.\n'));
});

test('compileStockPrompt is deterministic', () => {
  const a = compileStockPrompt('vision-layout-agent', { kernelText: 'ocr please' });
  const b = compileStockPrompt('vision-layout-agent', { kernelText: 'ocr please' });
  assert.equal(a, b);
  assert.equal(sha256(a), sha256(b));
});

test('compileManifestPrompts: every non-variant agent, index carries frame + agent digests', async () => {
  const manifest = await loadManifest();
  const { prompts, index } = compileManifestPrompts(manifest, loadDeclaredKernel);

  const baseAliases = manifest.agents.filter((a) => !a.variant_of && loadDeclaredKernel(a)).map((a) => a.alias);
  assert.deepEqual([...prompts.keys()].sort(), [...baseAliases].sort());
  for (const alias of prompts.keys()) assert.ok(!alias.includes('@'), `variant leaked: ${alias}`);

  assert.equal(index.version, 1);
  assert.deepEqual(Object.keys(index.frames).sort(), ['agency', 'confidence', 'handoff', 'memory-feedback-loop']);
  for (const [alias, meta] of Object.entries(index.agents)) {
    assert.equal(meta.sha256, sha256(prompts.get(alias)));
    assert.deepEqual(meta.layers, stockPromptLayers(alias));
    assert.equal(meta.bytes, Buffer.byteLength(prompts.get(alias), 'utf8'));
  }

  // the nexus compiled prompt stays within the microkernel bound
  assert.ok(index.agents['tool-router-agent'].bytes <= MICROKERNEL_MAX_CHARS);
  assert.deepEqual(index.agents['tool-router-agent'].layers, []);
});

test('build/prompts/ is committed fresh — run `green-roomz compile` if this fails', async () => {
  const manifest = await loadManifest();
  const { prompts, index } = compileManifestPrompts(manifest, loadDeclaredKernel);
  const dir = fileURLToPath(new URL('../build/prompts/', import.meta.url));
  const read = (name) => readFileSync(dir + name, 'utf8').replace(/\r\n/g, '\n');
  for (const [alias, text] of prompts) {
    assert.equal(read(`${alias}.md`), text, `build/prompts/${alias}.md is stale`);
  }
  assert.equal(read('index.json'), `${JSON.stringify(index, null, 2)}\n`, 'build/prompts/index.json is stale');
});
