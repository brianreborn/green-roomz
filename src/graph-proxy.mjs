import { readFile } from 'node:fs/promises';
import http from 'node:http';
import { proxyJson } from './proxy.mjs';

const BODY_LIMIT = 16 * 1024 * 1024;
const ALIAS_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const LOOPBACK = new Set(['127.0.0.1', '[::1]']);

function integer(value, min, max) {
  return Number.isInteger(value) && value >= min && value <= max;
}

export function validateGraphProxyManifest(manifest) {
  if (!manifest || manifest.schema_version !== 1 || typeof manifest.graph_host !== 'string' || !manifest.graph_host) {
    throw new Error('graph-proxy manifest needs schema_version 1 and graph_host');
  }
  const gateway = manifest.gateway;
  if (!gateway || !LOOPBACK.has(gateway.host) || !integer(gateway.port, 1, 65535)) {
    throw new Error('graph-proxy gateway must use a loopback host and port 1-65535');
  }
  if (!manifest.aliases || typeof manifest.aliases !== 'object' || Array.isArray(manifest.aliases)
      || !Object.keys(manifest.aliases).length) {
    throw new Error('graph-proxy manifest needs at least one alias');
  }
  for (const [alias, backend] of Object.entries(manifest.aliases)) {
    if (!ALIAS_RE.test(alias)) throw new Error(`invalid graph alias: ${alias}`);
    if (!backend || !['chat', 'embedding'].includes(backend.kind) || typeof backend.url !== 'string') {
      throw new Error(`alias ${alias} needs kind chat|embedding and a local URL`);
    }
    let url;
    try {
      url = new URL(backend.url);
    } catch {
      throw new Error(`alias ${alias} has an invalid backend URL`);
    }
    if (url.protocol !== 'http:' || !LOOPBACK.has(url.hostname) || !integer(Number(url.port), 1, 65535)) {
      throw new Error(`alias ${alias} backend must be an HTTP loopback URL with an explicit port`);
    }
    if (url.pathname !== '/' || url.search || url.hash || url.username || url.password) {
      throw new Error(`alias ${alias} backend URL must contain only scheme, host, and port`);
    }
  }
  return manifest;
}

function json(response, status, value) {
  const body = Buffer.from(JSON.stringify(value));
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': body.length,
    'cache-control': 'no-store',
  });
  response.end(body);
}

async function readJson(request) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > BODY_LIMIT) {
      const error = new Error('request body exceeds 16 MiB limit');
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('expected JSON object');
    return body;
  } catch {
    const error = new Error('request body must be a JSON object');
    error.statusCode = 400;
    throw error;
  }
}

function modelRecord(alias, backend) {
  return {
    id: alias,
    object: 'model',
    owned_by: 'familia',
    capabilities: backend.kind === 'embedding' ? ['embedding'] : ['text', 'chat'],
  };
}

export function createGraphProxyServer(input, { fetchImpl = fetch } = {}) {
  const manifest = validateGraphProxyManifest(input);
  const server = http.createServer(async (request, response) => {
    const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
    if (request.method === 'GET' && (pathname === '/health' || pathname === '/v1/health')) {
      json(response, 200, { status: 'ok', graph_host: manifest.graph_host });
      return;
    }
    if (request.method === 'GET' && pathname === '/v1/models') {
      json(response, 200, {
        object: 'list',
        data: Object.entries(manifest.aliases).map(([alias, backend]) => modelRecord(alias, backend)),
      });
      return;
    }
    const modelMatch = pathname.match(/^\/v1\/models\/([^/]+)$/);
    if (request.method === 'GET' && modelMatch) {
      const alias = decodeURIComponent(modelMatch[1]);
      const backend = manifest.aliases[alias];
      if (!backend) {
        json(response, 404, { error: { message: `unknown graph alias: ${alias}`, type: 'invalid_request_error' } });
        return;
      }
      json(response, 200, modelRecord(alias, backend));
      return;
    }

    const route = pathname === '/v1/chat/completions'
      ? { kind: 'chat', path: pathname }
      : pathname === '/v1/embeddings'
        ? { kind: 'embedding', path: pathname }
        : null;
    if (!route) {
      json(response, 404, { error: { message: 'unknown route', type: 'invalid_request_error' } });
      return;
    }
    if (request.method !== 'POST') {
      json(response, 405, { error: { message: 'method not allowed', type: 'invalid_request_error' } });
      return;
    }

    try {
      const body = await readJson(request);
      const alias = typeof body.model === 'string' ? body.model.trim() : '';
      const backend = manifest.aliases[alias];
      if (!backend) {
        json(response, 404, { error: { message: `unknown graph alias: ${alias || '<missing>'}`, type: 'invalid_request_error' } });
        return;
      }
      if (backend.kind !== route.kind) {
        json(response, 400, { error: { message: `alias ${alias} does not serve ${route.kind}`, type: 'invalid_request_error' } });
        return;
      }
      await proxyJson({
        request,
        response,
        body,
        target: new URL(route.path, backend.url).toString(),
        config: {
          retry_deadline_ms: 180_000,
          retry_initial_ms: 150,
          retry_max_ms: 2000,
          upstream_timeout_ms: 600_000,
        },
        fetchImpl,
      });
    } catch (error) {
      if (response.headersSent || response.destroyed) {
        response.destroy(error);
        return;
      }
      json(response, error.statusCode ?? 502, {
        error: { message: error.message || 'graph backend request failed', type: 'upstream_error' },
      });
    }
  });
  return server;
}

function option(args, name) {
  const index = args.indexOf(name);
  return index < 0 ? null : args[index + 1] ?? null;
}

export async function main(args) {
  const manifestPath = option(args, '--manifest');
  if (!manifestPath || args.some((arg, index) => arg === '--manifest' && !args[index + 1])) {
    throw new Error('graph-proxy needs --manifest path');
  }
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const server = createGraphProxyServer(manifest);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(manifest.gateway.port, manifest.gateway.host, resolve);
  });
  const address = server.address();
  console.error(`green-roomz graph-proxy listening on ${address.address}:${address.port} for ${manifest.graph_host}`);
  const stop = () => server.close(() => process.exit(0));
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}
