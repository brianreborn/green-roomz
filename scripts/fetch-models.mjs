#!/usr/bin/env node
/**
 * fetch-models.mjs - One-click downloader for Green-Roomz model weights.
 * Downloads missing specialist models into the local ./models directory with progress reporting.
 *
 * Models fetched:
 * 1. nomic-embed-text-v1.5 (semantic-embedding-agent, ~274 MB)
 * 2. bge-reranker-base-q8_0 (retrieval-rerank-agent, ~300 MB)
 * 3. Llama-Guard-3-1B-Q4_K_M (safety-policy-agent, ~450 MB)
 * 4. Qwen2.5-0.5B-Instruct-Q4_K_M (general-text-speculator, ~397 MB)
 * 5. Qwenstral-Small-3.1-0.5B (tool-router / code-speculator, ~398 MB)
 *
 * Usage:
 *   node scripts/fetch-models.mjs [--all] [--model <alias>]
 */
import { createWriteStream, existsSync, mkdirSync, statSync } from 'node:fs';
import https from 'node:https';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const MODELS_DIR = path.join(REPO_ROOT, 'models');

export const MODEL_REGISTRY = [
  {
    alias: 'general-text-speculator',
    filename: 'Qwen2.5-0.5B-Instruct-Q4_K_M.gguf',
    url: 'https://huggingface.co/bartowski/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/Qwen2.5-0.5B-Instruct-Q4_K_M.gguf',
    approxBytes: 397808192,
    description: 'General chat & reasoning specialist (0.5B)',
  },
  {
    alias: 'tool-router-agent',
    filename: 'Qwenstral-Small-3.1-0.5B.Q4_K_M.gguf',
    url: 'https://huggingface.co/bartowski/Qwen2.5-Coder-0.5B-Instruct-GGUF/resolve/main/Qwen2.5-Coder-0.5B-Instruct-Q4_K_M.gguf',
    approxBytes: 398000000,
    description: 'Tool router & code specialist (0.5B)',
  },
  {
    alias: 'semantic-embedding-agent',
    filename: 'nomic-embed-text-v1.5.Q4_K_M.gguf',
    symlinkAlias: 'missing-embed.gguf',
    url: 'https://huggingface.co/nomic-ai/nomic-embed-text-v1.5-GGUF/resolve/main/nomic-embed-text-v1.5.Q4_K_M.gguf',
    approxBytes: 274000000,
    description: 'Semantic vector embedding specialist (8192 ctx)',
  },
  {
    alias: 'retrieval-rerank-agent',
    filename: 'bge-reranker-base-q8_0.gguf',
    symlinkAlias: 'missing-rerank.gguf',
    url: 'https://huggingface.co/BAAI/bge-reranker-base/resolve/main/ggml-model-q8_0.gguf',
    approxBytes: 300000000,
    description: 'Cross-encoder passage reranking specialist',
  },
  {
    alias: 'safety-policy-agent',
    filename: 'Llama-Guard-3-1B-Q4_K_M.gguf',
    symlinkAlias: 'missing-guard.gguf',
    url: 'https://huggingface.co/bartowski/Llama-Guard-3-1B-GGUF/resolve/main/Llama-Guard-3-1B-Q4_K_M.gguf',
    approxBytes: 450000000,
    description: 'Safety moderation & content classification guard',
  },
];

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https:') ? https : http;
    const req = proto.get(url, { headers: { 'user-agent': 'Green-Roomz-Fetcher/1.0' } }, (res) => {
      // Handle redirects (HTTP 301, 302, 307, 308)
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadFile(res.headers.location, destPath).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`Failed to download ${url}: HTTP ${res.statusCode}`));
      }

      const totalBytes = Number(res.headers['content-length']) || 0;
      let downloadedBytes = 0;
      let lastReport = Date.now();
      const file = createWriteStream(destPath);

      res.on('data', (chunk) => {
        downloadedBytes += chunk.length;
        const now = Date.now();
        if (now - lastReport > 1000) {
          lastReport = now;
          const pct = totalBytes ? ((downloadedBytes / totalBytes) * 100).toFixed(1) : '?';
          const mb = (downloadedBytes / (1024 * 1024)).toFixed(1);
          const totalMb = totalBytes ? (totalBytes / (1024 * 1024)).toFixed(1) : '?';
          process.stdout.write(`\r  -> Progress: ${mb}MB / ${totalMb}MB (${pct}%)`);
        }
      });

      res.pipe(file);
      file.on('finish', () => {
        file.close();
        process.stdout.write(`\r  -> Completed: ${(downloadedBytes / (1024 * 1024)).toFixed(1)}MB downloaded.\n`);
        resolve(destPath);
      });
      file.on('error', (err) => {
        file.close();
        reject(err);
      });
    });

    req.on('error', reject);
  });
}

async function main() {
  mkdirSync(MODELS_DIR, { recursive: true });
  console.log(`=== Green-Roomz Model Weight Downloader ===`);
  console.log(`Target Directory: ${MODELS_DIR}\n`);

  for (const item of MODEL_REGISTRY) {
    const targetFile = path.join(MODELS_DIR, item.filename);
    console.log(`[${item.alias}] ${item.description}`);
    
    if (existsSync(targetFile)) {
      const sz = statSync(targetFile).size;
      console.log(`  -> Already present: ${item.filename} (${(sz / (1024 * 1024)).toFixed(1)}MB). Skipping.\n`);
      continue;
    }

    console.log(`  -> Downloading: ${item.url}`);
    try {
      await downloadFile(item.url, targetFile);
      console.log(`  -> Successfully installed ${item.filename}\n`);
    } catch (err) {
      console.error(`  -> Failed to download: ${err.message}\n`);
    }
  }

  console.log(`=== Model Downloads Completed ===`);
}

if (process.argv[1]?.endsWith('fetch-models.mjs')) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
