#!/usr/bin/env node
/**
 * make-speech - LAUNCH HARNESS. Synthesize speech WAV artifacts with piper so the
 * audio-transcription path can be tested end to end (piper -> wav -> whisper).
 *
 *   node deploy/make-speech.mjs "some text" out.wav
 *   node deploy/make-speech.mjs --fixtures [dir]      # regenerate e2e/assets/*
 *
 * Env: GRZ_PIPER (piper.exe), GRZ_PIPER_VOICE (.onnx). Defaults to C:/LocalAI.
 */
import { execFile } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PIPER = process.env.GRZ_PIPER || 'C:/LocalAI/piper/piper.exe';
const VOICE = process.env.GRZ_PIPER_VOICE || 'C:/LocalAI/piper/voices/en_US-lessac-medium.onnx';
const FESTIVAL_BIN = process.env.GRZ_FESTIVAL || process.env.FESTIVAL_BIN || 'text2wave';
const FLITE_BIN = process.env.GRZ_FLITE || 'flite';
const TTS_ENGINE = (process.env.GRZ_TTS_ENGINE || 'auto').toLowerCase();
const REPO = path.resolve(fileURLToPath(new URL('../', import.meta.url)));

// Canonical phrases: short, unambiguous, easy to assert a loose match on.
export const FIXTURES = [
  { name: 'hello-world', text: 'Hello world.', expect: /hello,?\s*world/i },
  { name: 'quick-brown-fox', text: 'The quick brown fox jumps over the lazy dog.', expect: /quick brown fox/i },
  { name: 'green-roomz-probe', text: 'Green roomz audio transcription health probe.', expect: /green\s*room/i },
];

export function synthesize(text, outFile, options = {}) {
  const engine = options.engine || TTS_ENGINE;
  mkdirSync(path.dirname(outFile), { recursive: true });

  // 1. Explicit Festival / text2wave engine
  if (engine === 'festival') {
    return new Promise((resolve, reject) => {
      const festivalArgs = ['-o', outFile];
      if (options.voice) festivalArgs.unshift('-eval', `(voice_${options.voice})`);
      const child = execFile(FESTIVAL_BIN, festivalArgs, { timeout: 30_000, windowsHide: true },
        (err) => (err ? reject(err) : resolve(outFile)));
      child.stdin.end(text);
    });
  }

  // 2. Explicit Flite engine (Festival-lite C runtime)
  if (engine === 'flite') {
    return new Promise((resolve, reject) => {
      const fliteArgs = ['-t', text, '-o', outFile];
      if (options.voice) fliteArgs.push('-voice', options.voice);
      execFile(FLITE_BIN, fliteArgs, { timeout: 30_000, windowsHide: true },
        (err) => (err ? reject(err) : resolve(outFile)));
    });
  }

  // 3. Piper engine or Auto Fallback
  if (existsSync(PIPER) && existsSync(VOICE)) {
    return new Promise((resolve, reject) => {
      const child = execFile(PIPER, ['--model', options.voice || VOICE, '--output_file', outFile], { timeout: 30_000, windowsHide: true },
        (err) => (err ? reject(err) : resolve(outFile)));
      child.stdin.end(text);
    });
  }

  // Auto fallback to Festival if Piper is absent
  return new Promise((resolve, reject) => {
    const child = execFile(FESTIVAL_BIN, ['-o', outFile], { timeout: 30_000, windowsHide: true },
      (err) => (err ? reject(new Error(`No TTS engine available (piper missing and festival failed: ${err.message})`)) : resolve(outFile)));
    child.stdin.end(text);
  });
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv[0] === '--fixtures') {
    const dir = argv[1] || path.join(REPO, 'e2e', 'assets');
    const index = [];
    for (const f of FIXTURES) {
      const out = path.join(dir, `${f.name}.wav`);
      await synthesize(f.text, out);
      index.push({ file: `${f.name}.wav`, text: f.text, expect: f.expect.source, flags: f.expect.flags });
      console.error(`wrote ${out}`);
    }
    writeFileSync(path.join(dir, 'index.json'), JSON.stringify(index, null, 2) + '\n');
    console.error(`wrote ${path.join(dir, 'index.json')}`);
    return;
  }
  
  let engine = TTS_ENGINE;
  let voice = null;
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--engine' && argv[i + 1]) { engine = argv[++i]; }
    else if (argv[i] === '--voice' && argv[i + 1]) { voice = argv[++i]; }
    else { positional.push(argv[i]); }
  }

  const [text, out] = positional;
  if (!text || !out) {
    console.error('usage: make-speech.mjs [--engine piper|festival|flite] [--voice <voice>] "text" out.wav  |  --fixtures [dir]');
    process.exit(2);
  }
  await synthesize(text, out, { engine, voice });
  console.log(out);
}

if (process.argv[1]?.endsWith('make-speech.mjs')) main().catch((e) => { console.error(e.message); process.exit(1); });
