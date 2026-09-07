#!/usr/bin/env node
/**
 * Live UAT against a running gateway (operator path, not domain unit tests).
 *
 *   node scripts/uat.mjs
 *   node scripts/uat.mjs http://127.0.0.1:8080
 *
 * Automated e2e (own llama + throwaway ports) is separate:
 *   GRZ_E2E=1 npm run test:e2e
 *
 * Exit 0 only if every required operator check passes.
 */
const base = (process.argv[2] || process.env.GRZ_BASE_URL || 'http://127.0.0.1:8080').replace(/\/$/, '');
const CHAT_MS = Number(process.env.GRZ_UAT_CHAT_MS ?? 600_000);
const rows = [];

function sseText(text) {
  let out = '';
  for (const line of String(text).split(/\r?\n/)) {
    if (!line.startsWith('data:')) continue;
    const data = line.slice(5).trim();
    if (!data || data === '[DONE]') continue;
    try {
      out += JSON.parse(data)?.choices?.[0]?.delta?.content
        ?? JSON.parse(data)?.choices?.[0]?.message?.content
        ?? '';
    } catch { /* keep going */ }
  }
  return out;
}

function record(id, ok, detail) {
  rows.push({ id, ok, detail });
  const mark = ok ? 'PASS' : 'FAIL';
  console.log(`${mark}  ${id}${detail ? `  ${detail}` : ''}`);
}

async function http(pathname, { method = 'GET', body, headers = {}, timeout = 60_000 } = {}) {
  const res = await fetch(base + pathname, {
    method,
    headers: body ? { 'content-type': 'application/json', ...headers } : headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeout),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* html or empty */ }
  return { status: res.status, type: res.headers.get('content-type') ?? '', text, json, headers: res.headers };
}

async function check(id, fn) {
  try {
    await fn();
  } catch (error) {
    record(id, false, error.message);
  }
}

await check('GET / operator HTML', async () => {
  const root = await http('/');
  record('GET / operator HTML', root.status === 200 && /text\/html/.test(root.type) && /OpenAI-compatible/.test(root.text) && /unicorn/i.test(root.text),
    `${root.status} ${root.type.split(';')[0]}`);
});

await check('GET /unicorn HTML', async () => {
  const page = await http('/unicorn');
  record('GET /unicorn HTML', page.status === 200 && /text\/html/.test(page.type) && /Green Unicorn/.test(page.text),
    `${page.status} ${page.type.split(';')[0]}`);
});

await check('GET /health', async () => {
  const health = await http('/health');
  record('GET /health', health.status === 200 && health.json?.product === 'Green-Roomz',
    `${health.status} ${health.json?.status ?? health.text.slice(0, 80)}`);
});

await check('GET /v1/models', async () => {
  const models = await http('/v1/models');
  const ids = (models.json?.data ?? []).map((m) => m.id);
  record('GET /v1/models', models.status === 200 && ids.includes('general-text-speculator'),
    ids.slice(0, 6).join(',') || String(models.status));
});

let chatSid = null;
await check('POST chat hello', async () => {
  const chat = await http('/v1/chat/completions', {
    method: 'POST',
    body: {
      model: 'general-text-speculator',
      lock_alias: true,
      stream: true,
      max_tokens: 16,
      messages: [{ role: 'user', content: 'Say hello in one short sentence.' }],
    },
    timeout: CHAT_MS,
  });
  const content = sseText(chat.text) || chat.json?.choices?.[0]?.message?.content || '';
  record('POST chat hello', chat.status === 200 && content.length > 0,
    `${chat.status} ${content.slice(0, 80)}`);
  chatSid = chat.headers.get('x-green-roomz-session') ?? chat.headers.get('x-session-id');
});

await check('POST /vision without image is 400', async () => {
  const vision = await http('/v1/chat/completions', {
    method: 'POST',
    body: { messages: [{ role: 'user', content: '/vision' }], max_tokens: 8 },
  });
  record('POST /vision without image is 400', vision.status === 400, String(vision.status));
});

await check('session follow-up', async () => {
  if (!chatSid) {
    record('session follow-up', false, 'no session header on first chat');
    return;
  }
  const follow = await http('/v1/chat/completions', {
    method: 'POST',
    headers: { 'x-session-id': chatSid },
    body: {
      model: 'general-text-speculator',
      lock_alias: true,
      stream: true,
      max_tokens: 16,
      messages: [{ role: 'user', content: 'What did I just ask you to say?' }],
    },
    timeout: CHAT_MS,
  });
  const followText = sseText(follow.text) || follow.json?.choices?.[0]?.message?.content || '';
  record('session follow-up', follow.status === 200 && (followText.length > 0 || /\[DONE\]/.test(follow.text)),
    `${follow.status} ${(followText || follow.text).slice(0, 80)}`);
});

const httpsUrl = base.replace(/^http:/, 'https:');
try {
  await fetch(httpsUrl + '/health', { signal: AbortSignal.timeout(4000) });
  record('https:// to :8080 must fail (no TLS)', false, 'TLS unexpectedly succeeded');
} catch (error) {
  record('https:// to :8080 must fail (no TLS)', true, error.cause?.code ?? error.message);
}

const failed = rows.filter((row) => !row.ok);
console.log(`UAT ${failed.length ? 'FAIL' : 'PASS'}  ${rows.length - failed.length}/${rows.length}  ${base}`);
process.exit(failed.length ? 1 : 0);
