#!/usr/bin/env node
/**
 * make-moderation - LAUNCH HARNESS for content safety and moderation classification.
 * Checks input text against safety policy categories via the Green-Roomz Gateway.
 *
 * Usage:
 *   node deploy/make-moderation.mjs "text to check"
 *
 * Env:
 *   GRZ_GATEWAY (default: http://127.0.0.1:8080)
 */
import http from 'node:http';

const GATEWAY = process.env.GRZ_GATEWAY || 'http://127.0.0.1:8080';

export function checkModeration(input, options = {}) {
  const url = new URL('/v1/moderations', options.gateway || GATEWAY);
  const payload = JSON.stringify({
    model: options.model || 'safety-policy-agent',
    input,
  });

  return new Promise((resolve, reject) => {
    const req = http.request(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(payload),
      },
      timeout: options.timeout || 30_000,
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
    req.on('timeout', () => req.destroy(new Error('Moderation request timeout')));
    req.write(payload);
    req.end();
  });
}

async function main() {
  const argv = process.argv.slice(2);
  const input = argv.join(' ').trim();

  if (!input) {
    console.error('usage: make-moderation.mjs "text to classify"');
    process.exit(2);
  }

  const res = await checkModeration(input);
  console.log(JSON.stringify(res, null, 2));
}

if (process.argv[1]?.endsWith('make-moderation.mjs')) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}

