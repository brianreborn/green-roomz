import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { createGraphProxyServer, validateGraphProxyManifest } from '../src/graph-proxy.mjs';

function manifest(port, aliases = { coder: { kind: 'chat', url: `http://127.0.0.1:${port}` } }) {
  return {
    schema_version: 1,
    graph_host: 'test-host',
    gateway: { host: '127.0.0.1', port: 9931 },
    aliases,
  };
}

async function listen(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return server.address().port;
}

async function close(server) {
  const closed = once(server, 'close');
  server.close();
  await closed;
}

test('graph proxy manifests are loopback-only and require explicit aliases', () => {
  assert.equal(validateGraphProxyManifest(manifest(12345)).graph_host, 'test-host');
  assert.throws(() => validateGraphProxyManifest(manifest(12345, {
    coder: { kind: 'chat', url: 'http://192.168.1.2:9941' },
  })), /loopback URL/);
  assert.throws(() => validateGraphProxyManifest(manifest(12345, {
    coder: { kind: 'chat', url: 'http://localhost:9941' },
  })), /loopback URL/);
  assert.throws(() => validateGraphProxyManifest(manifest(12345, {})), /at least one alias/);
});

test('graph proxy maps chat and embedding aliases to their exact local endpoints', async () => {
  const seen = [];
  const backend = http.createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    seen.push({ path: request.url, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) });
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify(request.url === '/v1/embeddings'
      ? { object: 'list', data: [] }
      : { id: 'chatcmpl-test', choices: [{ message: { role: 'assistant', content: 'ok' } }] }));
  });
  const backendPort = await listen(backend);
  const gateway = createGraphProxyServer(manifest(backendPort, {
    coder: { kind: 'chat', url: `http://127.0.0.1:${backendPort}` },
    embed: { kind: 'embedding', url: `http://127.0.0.1:${backendPort}` },
  }));
  const gatewayPort = await listen(gateway);

  try {
    const models = await fetch(`http://127.0.0.1:${gatewayPort}/v1/models`).then((r) => r.json());
    assert.deepEqual(models.data.map((model) => model.id), ['coder', 'embed']);

    const chat = await fetch(`http://127.0.0.1:${gatewayPort}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'coder', messages: [{ role: 'user', content: 'test' }] }),
    });
    assert.equal(chat.status, 200);
    assert.equal((await chat.json()).choices[0].message.content, 'ok');

    const embedding = await fetch(`http://127.0.0.1:${gatewayPort}/v1/embeddings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'embed', input: 'test' }),
    });
    assert.equal(embedding.status, 200);
    assert.deepEqual((await embedding.json()).data, []);
    assert.deepEqual(seen.map(({ path, body }) => [path, body.model]), [
      ['/v1/chat/completions', 'coder'],
      ['/v1/embeddings', 'embed'],
    ]);
  } finally {
    await close(gateway);
    await close(backend);
  }
});

test('graph proxy rejects unknown aliases and modality mismatches', async () => {
  const backend = http.createServer((_request, response) => response.end('{}'));
  const backendPort = await listen(backend);
  const gateway = createGraphProxyServer(manifest(backendPort));
  const gatewayPort = await listen(gateway);
  try {
    const response = await fetch(`http://127.0.0.1:${gatewayPort}/v1/embeddings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'coder', input: 'test' }),
    });
    assert.equal(response.status, 400);
  } finally {
    await close(gateway);
    await close(backend);
  }
});
