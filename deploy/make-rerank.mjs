#!/usr/bin/env node
/**
 * make-rerank - LAUNCH HARNESS for cross-encoder document reranking.
 * Ranks a list of candidate documents against a query.
 *
 * Usage:
 *   node deploy/make-rerank.mjs "query" "doc1" "doc2" "doc3"
 *
 * Env:
 *   GRZ_GATEWAY (default: http://127.0.0.1:8080)
 */
import http from 'node:http';

const GATEWAY = process.env.GRZ_GATEWAY || 'http://127.0.0.1:8080';

export function rerankDocuments(query, documents, options = {}) {
  const url = new URL('/v1/rerank', options.gateway || GATEWAY);
  const payload = JSON.stringify({
    model: options.model || 'retrieval-rerank-agent',
    query,
    documents,
    top_n: options.top_n ?? documents.length,
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
    req.on('timeout', () => req.destroy(new Error('Rerank request timeout')));
    req.write(payload);
    req.end();
  });
}

async function main() {
  const argv = process.argv.slice(2);
  const query = argv[0];
  const documents = argv.slice(1);

  if (!query || documents.length === 0) {
    console.error('usage: make-rerank.mjs "query" "doc1" "doc2" ...');
    process.exit(2);
  }

  const res = await rerankDocuments(query, documents);
  console.log(JSON.stringify(res, null, 2));
}

if (process.argv[1]?.endsWith('make-rerank.mjs')) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
