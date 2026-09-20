#!/usr/bin/env node
/**
 * make-embed - LAUNCH HARNESS for semantic embeddings.
 * Generates vector embeddings for single texts or batches via the Green-Roomz Gateway.
 *
 * Usage:
 *   node deploy/make-embed.mjs "some text to embed"
 *   node deploy/make-embed.mjs --compare "text 1" "text 2"
 *
 * Env:
 *   GRZ_GATEWAY (default: http://127.0.0.1:8080)
 */
import http from 'node:http';

const GATEWAY = process.env.GRZ_GATEWAY || 'http://127.0.0.1:8080';

export function getEmbedding(input, options = {}) {
  const url = new URL('/v1/embeddings', options.gateway || GATEWAY);
  const payload = JSON.stringify({
    model: options.model || 'semantic-embedding-agent',
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
    req.on('timeout', () => req.destroy(new Error('Embedding request timeout')));
    req.write(payload);
    req.end();
  });
}

export function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv[0] === '--compare' && argv[1] && argv[2]) {
    const [resA, resB] = await Promise.all([
      getEmbedding(argv[1]),
      getEmbedding(argv[2]),
    ]);
    const vecA = resA.data?.[0]?.embedding;
    const vecB = resB.data?.[0]?.embedding;
    const sim = cosineSimilarity(vecA, vecB);
    console.log(JSON.stringify({ text1: argv[1], text2: argv[2], cosine_similarity: sim }, null, 2));
    return;
  }

  const text = argv[0];
  if (!text) {
    console.error('usage: make-embed.mjs "text" | --compare "text 1" "text 2"');
    process.exit(2);
  }

  const res = await getEmbedding(text);
  console.log(JSON.stringify(res, null, 2));
}

if (process.argv[1]?.endsWith('make-embed.mjs')) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
