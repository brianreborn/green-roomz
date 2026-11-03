// SD-32: the gateway (and process manager) authenticate THEMSELVES to llama-server with the
// host's own key (api_key_file via readApiKeyFile, or GREEN_ROOMZ_API_KEY). A client's
// Authorization header is never forwarded upstream; clients are authenticated separately at
// the gateway edge (identityFrom).
import { readApiKeyFile } from './config.mjs';

// (b) Fixed backend host and a fixed llama-server path allowlist; ports come from the manifest
// (agents[].port and variants), never from a client.
export const UPSTREAM_HOST = '127.0.0.1';
export const UPSTREAM_KEY_PATHS = Object.freeze(new Set(['/health', '/props', '/slots', '/slots/0', '/v1/models',
  '/v1/chat/completions', '/v1/completions', '/completion', '/v1/embeddings', '/embedding', '/v1/rerank', '/rerank',
  '/tokenize', '/detokenize']));

export function backendPorts(manifest) {
  const ports = new Set();
  for (const a of manifest?.agents ?? []) {
    if (Number.isInteger(Number(a?.port)) && a.port) ports.add(Number(a.port));
    for (const v of (Array.isArray(a?.variants) ? a.variants : Object.values(a?.variants ?? {}))) if (v?.port) ports.add(Number(v.port));
  }
  return ports;
}

/** Key the local llama-server was started with (runner: --api-key-file). '' when none. */
export function upstreamApiKey(manifest, env = process.env) {
  const file = manifest?._meta?.hostOverride?.api_key_file;
  if (file) return readApiKeyFile(file, { HOME: manifest._meta.hostHome ?? env.HOME });
  return env.GREEN_ROOMZ_API_KEY || '';
}

function parse(url) { try { return new URL(String(url instanceof Request ? url.url : url)); } catch { return null; } }
function isLoopback(u) { return !!u && ['127.0.0.1', 'localhost', '[::1]', '::1'].includes(u.hostname); }
/** True only for http://127.0.0.1:<manifest port><allowlisted path>. ports=null: any port. */
export function keyEligible(url, ports) {
  const u = parse(url);
  if (!u || u.protocol !== 'http:' || u.hostname !== UPSTREAM_HOST || u.username || u.password) return false;
  if (ports && !ports.has(Number(u.port))) return false;
  return UPSTREAM_KEY_PATHS.has(u.pathname);
}
/** (c) Redact the key from any text (error messages, logs). */
export function redactKey(text, key) {
  const t = String(text ?? '');
  return key ? t.split(key).join('[REDACTED]') : t;
}

/** Wrap a fetch: for loopback (llama-server) URLs, drop any inbound Authorization and send
 * `Bearer <key>` when a key is set. Non-loopback URLs are passed through untouched. */
export function withUpstreamKey(fetchFn, key, ports = null) {
  if (typeof fetchFn !== 'function' || fetchFn.__grzUpstreamKey) return fetchFn;
  const wrapped = async (url, init = {}) => {
    const u = parse(url);
    if (!isLoopback(u)) return fetchFn(url, init);
    // Never forward a client Authorization to a local backend.
    const headers = new Headers(init?.headers ?? {});
    headers.delete('authorization');
    if (key && keyEligible(url, ports)) headers.set('authorization', `Bearer ${key}`);
    try {
      return await fetchFn(url, { ...init, headers: Object.fromEntries(headers.entries()) });
    } catch (err) {
      if (key && err && typeof err.message === 'string' && err.message.includes(key)) err.message = redactKey(err.message, key);
      throw err;
    }
  };
  wrapped.__grzUpstreamKey = true;
  return wrapped;
}
