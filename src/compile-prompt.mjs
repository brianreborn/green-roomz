/**
 * Stock system-prompt compilation.
 *
 * The prompt an agent runs is layered fragments + its kernel, joined into one
 * system message and committed to build/prompts/. Pure: same inputs -> same
 * bytes. See docs/stock-prompts.md.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import {
  NEXUS_ALIAS,
  MONITOR_ALIAS,
  MICROKERNEL_MAX_CHARS,
} from './constants.mjs';
import { assertNexusKernelText } from './kernel-text.mjs';

const SAFETY_ALIAS = 'safety-policy-agent';

/**
 * The cognitive agents: those that reason over a working set across turns, so
 * the memory-feedback-loop frame is behaviour they can actually run. Single-shot
 * transducers (vision OCR, transcription, image-gen), the sub-perceptual router,
 * and the critical kernels are not cognitive agents and do not carry it. This is
 * a fact about the roster, not a rollout knob — a future working-set agent is a
 * cognitive agent by definition. See docs/stock-prompts.md.
 */
const MFL_ALIASES = new Set(['general-text-speculator', 'qwenstral-code-speculator']);

export const FRAMES_DIR = fileURLToPath(new URL('../policies/frames/', import.meta.url));
export const FRAME_NAMES = Object.freeze(['agency', 'memory-feedback-loop', 'confidence']);

/**
 * Ordered frame names for an alias, outermost first. Empty = kernel only.
 * The nexus microkernel and the critical kernels (safety, monitor) carry no
 * cognitive framing (MICROKERNEL_MAX_CHARS bound; MFL-3 / MFL-21).
 */
export function stockPromptLayers(alias) {
  if (alias === NEXUS_ALIAS || alias === MONITOR_ALIAS || alias === SAFETY_ALIAS) return [];
  const layers = ['agency'];
  if (MFL_ALIASES.has(alias)) layers.push('memory-feedback-loop');
  layers.push('confidence');
  return layers;
}

export function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

const normalize = (text) => String(text).replace(/\r\n/g, '\n').trim();

function readFrame(name, framesDir) {
  return normalize(readFileSync(path.join(framesDir, `${name}.md`), 'utf8'));
}

/**
 * Compile the stock system prompt for one agent.
 *   compileStockPrompt(agent, { kernelText, framesDir })
 * `kernelText` is required (the caller loads it via loadDeclaredKernel so the
 * NEXUS_ALIAS text bound is applied to the raw kernel too). `framesDir`
 * defaults to policies/frames/.
 */
export function compileStockPrompt(agent, { kernelText, framesDir = FRAMES_DIR } = {}) {
  const alias = typeof agent === 'string' ? agent : agent?.alias;
  if (typeof kernelText !== 'string' || !kernelText.trim()) {
    throw new TypeError(`compileStockPrompt(${alias}): kernelText is required`);
  }
  const layers = stockPromptLayers(alias);
  const parts = layers.map((name) => readFrame(name, framesDir));
  parts.push(normalize(kernelText));
  const text = `${parts.join('\n\n')}\n`;
  if (alias === NEXUS_ALIAS) {
    assertNexusKernelText(text); // compiled nexus prompt stays within the microkernel bound
  }
  return text;
}

/**
 * Full compile pass over a manifest's non-variant agents.
 * `loadKernel(agent) -> string|null` supplies each kernel (usually
 * loadDeclaredKernel). Returns { prompts: Map<alias,text>, index }.
 */
export function compileManifestPrompts(manifest, loadKernel, { framesDir = FRAMES_DIR } = {}) {
  const prompts = new Map();
  const agents = {};
  for (const agent of manifest.agents ?? []) {
    if (agent.variant_of) continue; // variants inherit the base alias prompt
    const kernelText = loadKernel(agent);
    if (!kernelText) continue;
    const text = compileStockPrompt(agent, { kernelText, framesDir });
    prompts.set(agent.alias, text);
    agents[agent.alias] = {
      sha256: sha256(text),
      layers: stockPromptLayers(agent.alias),
      bytes: Buffer.byteLength(text, 'utf8'),
    };
  }
  const frames = {};
  for (const name of FRAME_NAMES) frames[name] = sha256(readFrame(name, framesDir));
  return {
    prompts,
    index: { version: 1, frames, agents },
  };
}

export { MICROKERNEL_MAX_CHARS };
