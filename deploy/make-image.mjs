#!/usr/bin/env node
/**
 * make-image - LAUNCH HARNESS for image generation.
 * Synthesizes images from text prompts via the Green-Roomz Gateway.
 *
 * Usage:
 *   node deploy/make-image.mjs "a futuristic green server room" out.png
 *
 * Env:
 *   GRZ_GATEWAY (default: http://127.0.0.1:8080)
 */
import http from 'node:http';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const GATEWAY = process.env.GRZ_GATEWAY || 'http://127.0.0.1:8080';

export function generateImage(prompt, options = {}) {
  const url = new URL('/v1/images/generations', options.gateway || GATEWAY);
  const payload = JSON.stringify({
    model: options.model || 'image-generation-agent',
    prompt,
    n: options.n || 1,
    size: options.size || '512x512',
    response_format: options.response_format || 'b64_json',
  });

  return new Promise((resolve, reject) => {
    const req = http.request(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(payload),
      },
      timeout: options.timeout || 60_000,
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
        if (res.statusCode >= 400) {
          return reject(new Error(body.error?.message || `HTTP ${res.statusCode}`));
        }
        resolve(body);
      });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('Image generation timeout')));
    req.write(payload);
    req.end();
  });
}

async function main() {
  const argv = process.argv.slice(2);
  const prompt = argv[0];
  const outFile = argv[1];

  if (!prompt) {
    console.error('usage: make-image.mjs "prompt text" [output.png]');
    process.exit(2);
  }

  const res = await generateImage(prompt);
  const b64 = res.data?.[0]?.b64_json;
  if (b64 && outFile) {
    mkdirSync(path.dirname(outFile), { recursive: true });
    writeFileSync(outFile, Buffer.from(b64, 'base64'));
    console.log(`Wrote image to ${outFile}`);
  } else {
    console.log(JSON.stringify(res, null, 2));
  }
}

if (process.argv[1]?.endsWith('make-image.mjs')) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
