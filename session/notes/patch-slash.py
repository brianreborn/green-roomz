from pathlib import Path

trees = [
    Path(r"C:\Users\brian\Documents\green-roomz"),
    Path(r"C:\Users\brian\Documents\Codex\2026-08-28\files-pasted-by-the-user-1\outputs\green-roomz"),
]

slash_fn = r"""
const SLASH_ALIASES = Object.freeze({
  vision: 'vision-layout-agent',
  audio: 'audio-transcription-agent',
  code: 'qwenstral-code-speculator',
  cpp: 'qwenstral-code-speculator',
  text: 'general-text-speculator',
  chat: 'general-text-speculator',
  embed: 'semantic-embedding-agent',
  rerank: 'retrieval-rerank-agent',
  router: 'tool-router-agent',
  guard: 'safety-policy-agent',
  tts: 'speech-synthesis-agent',
  speak: 'speech-synthesis-agent',
  image: 'image-generation-agent',
  imagine: 'image-generation-agent',
  draw: 'image-generation-agent',
  auto: 'auto',
});

export function parseSlashCommand(body) {
  const text = latestUserMessageText(body).trim();
  const match = /^\/([a-z]+)(?:\s+([\s\S]*))?$/i.exec(text);
  if (!match) return null;
  const token = match[1].toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(SLASH_ALIASES, token)) return null;
  return { token, alias: SLASH_ALIASES[token], rest: (match[2] ?? '').trim() };
}

export function stripSlashCommand(body) {
  const parsed = parseSlashCommand(body);
  if (!parsed || !Array.isArray(body?.messages)) return body;
  const messages = body.messages.map((message) => ({ ...message }));
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role !== 'user') continue;
    if (typeof messages[index].content === 'string') {
      messages[index] = { ...messages[index], content: parsed.rest };
    }
    break;
  }
  return { ...body, messages };
}

"""

hard_old = """export function hardRuleRoute(body, registry) {
  const modality = detectModalities(body);
  if (modality.image && modality.audio) throw new ValidationError('Mixed image and audio input requires an explicitly qualified workflow');
  if (modality.audio) return finish(body, registry, 'audio-transcription-agent', 'audio_input', modality);
  if (modality.image) return finish(body, registry, 'vision-layout-agent', 'image_input', modality);
  if (body?.lock_alias === true) {"""

hard_new = """export function hardRuleRoute(body, registry) {
  const modality = detectModalities(body);
  if (modality.image && modality.audio) throw new ValidationError('Mixed image and audio input requires an explicitly qualified workflow');
  if (modality.audio) return finish(body, registry, 'audio-transcription-agent', 'audio_input', modality);
  if (modality.image) return finish(body, registry, 'vision-layout-agent', 'image_input', modality);
  const slash = parseSlashCommand(body);
  if (slash && slash.alias && slash.alias !== 'auto') {
    return finish(body, registry, slash.alias, `slash_${slash.token}`, modality);
  }
  if (body?.lock_alias === true) {"""

prep_old = """export function prepareInferenceBody(body, agent) {
  const payload = injectSystemPolicy({ ...body, model: agent.alias }, agent);"""

prep_new = """export function prepareInferenceBody(body, agent) {
  const stripped = stripSlashCommand(body);
  const payload = injectSystemPolicy({ ...stripped, model: agent.alias }, agent);"""

gw_import_old = "import { detectModalities, hardRuleRoute, isRoutableAlias } from './routing.mjs';"
gw_import_new = "import { detectModalities, hardRuleRoute, isRoutableAlias, stripSlashCommand } from './routing.mjs';"

route_plan_old = """  async handleRoutePlan(request, response, body, identity, session, cors) {
    const nexusLive = this.registry.status(NEXUS_ALIAS).state !== 'unavailable';
    let plan = planRoute(body);"""

route_plan_new = """  async handleRoutePlan(request, response, body, identity, session, cors) {
    const hard = hardRuleRoute(body, this.registry);
    if (hard.effectiveAlias) {
      const routed = {
        requestedAlias: body.model ?? null,
        effectiveAlias: hard.effectiveAlias,
        reason: hard.reason,
        modality: hard.modality,
      };
      const issuedSession = session?.id ?? this.sessions.create({
        identity,
        agentAlias: routed.effectiveAlias,
        modality: routed.modality,
      });
      return jsonResponse(response, 200, {
        id: `grz-route-${issuedSession}`,
        object: 'chat.completion',
        model: NEXUS_ALIAS,
        choices: [{ index: 0, message: { role: 'assistant', content: JSON.stringify({ route: hard.effectiveAlias, reason_code: hard.reason }) }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      }, this.routeHeaders(issuedSession, routed, cors, { hops: '' }));
    }
    const nexusLive = this.registry.status(NEXUS_ALIAS).state !== 'unavailable';
    let plan = planRoute(body);"""

nexus_import_old = "import { availableAliases, isRoutableAlias, latestUserMessageText } from './routing.mjs';"
nexus_import_new = "import { availableAliases, detectModalities, isRoutableAlias, latestUserMessageText } from './routing.mjs';"

bad_old = """function routeIsBad(plan, registry, visited) {
  const route = plan?.route;
  if (!route) return 'missing route';
  if (route === NEXUS_ALIAS || route === 'auto') return `${route} is not a user-visible target`;
  if (visited.has(route)) return `${route} already visited`;
  if (!registry.agents.has(route)) return `${route} unknown`;
  if (!isRoutableAlias(registry, route)) {
    const missing = registry.status(route).missing ?? [];
    const why = missing.length ? 'missing model' : 'unavailable';
    return `${route} unavailable (${why})`;
  }
  return null;
}"""

bad_new = """function routeIsBad(plan, registry, visited, body) {
  const route = plan?.route;
  if (!route) return 'missing route';
  if (route === NEXUS_ALIAS || route === 'auto') return `${route} is not a user-visible target`;
  if (visited.has(route)) return `${route} already visited`;
  if (!registry.agents.has(route)) return `${route} unknown`;
  if (!isRoutableAlias(registry, route)) {
    const missing = registry.status(route).missing ?? [];
    const why = missing.length ? 'missing model' : 'unavailable';
    return `${route} unavailable (${why})`;
  }
  if (body) {
    const mod = detectModalities(body);
    if (route === 'vision-layout-agent' && !mod.image) return 'vision without image part';
    if (route === 'audio-transcription-agent' && !mod.audio) return 'audio without audio part';
  }
  return null;
}"""

for tree in trees:
    routing = tree / 'src' / 'routing.mjs'
    gateway = tree / 'src' / 'gateway.mjs'
    nexus = tree / 'src' / 'nexus.mjs'
    r = routing.read_text(encoding='utf-8')
    if 'parseSlashCommand' not in r:
        r = r.replace(
            'export function hardRuleRoute(body, registry) {',
            slash_fn + 'export function hardRuleRoute(body, registry) {',
            1,
        )
        print('INSERTED slash helpers', tree)
    else:
        print('slash helpers already present', tree)
        if "embed: 'semantic-embedding-agent'" not in r:
            old_map = """const SLASH_ALIASES = Object.freeze({
  code: 'qwenstral-code-speculator',
  cpp: 'qwenstral-code-speculator',
  text: 'general-text-speculator',
  chat: 'general-text-speculator',
  image: 'image-generation-agent',
  imagine: 'image-generation-agent',
  draw: 'image-generation-agent',
  vision: 'vision-layout-agent',
  tts: 'speech-synthesis-agent',
  speak: 'speech-synthesis-agent',
  auto: 'auto',
});"""
            new_map = """const SLASH_ALIASES = Object.freeze({
  vision: 'vision-layout-agent',
  audio: 'audio-transcription-agent',
  code: 'qwenstral-code-speculator',
  cpp: 'qwenstral-code-speculator',
  text: 'general-text-speculator',
  chat: 'general-text-speculator',
  embed: 'semantic-embedding-agent',
  rerank: 'retrieval-rerank-agent',
  router: 'tool-router-agent',
  guard: 'safety-policy-agent',
  tts: 'speech-synthesis-agent',
  speak: 'speech-synthesis-agent',
  image: 'image-generation-agent',
  imagine: 'image-generation-agent',
  draw: 'image-generation-agent',
  auto: 'auto',
});"""
            if old_map in r:
                r = r.replace(old_map, new_map)
                print('UPDATED slash map', tree)
            else:
                print('MISS slash map update', tree)
    if hard_old not in r:
        if 'slash.alias !== \'auto\'' in r or 'slash.alias !== "auto"' in r or "slash.alias !== 'auto'" in r:
            print('hard already patched', tree)
        else:
            print('MISS hard', tree)
    else:
        r = r.replace(hard_old, hard_new)
        print('OK hard', tree)
    routing.write_text(r, encoding='utf-8')

    g = gateway.read_text(encoding='utf-8')
    g = g.replace(gw_import_old, gw_import_new)
    if prep_old not in g:
        if 'stripSlashCommand(body)' in g:
            print('prep already patched', tree)
        else:
            print('MISS prep', tree)
    else:
        g = g.replace(prep_old, prep_new)
        print('OK prep', tree)
    if route_plan_old not in g:
        if 'const hard = hardRuleRoute(body, this.registry);' in g:
            print('routeplan already patched', tree)
        else:
            print('MISS routeplan', tree)
    else:
        g = g.replace(route_plan_old, route_plan_new)
        print('OK routeplan', tree)
    gateway.write_text(g, encoding='utf-8')

    n = nexus.read_text(encoding='utf-8')
    n = n.replace(nexus_import_old, nexus_import_new)
    if bad_old not in n:
        if 'vision without image part' in n:
            print('bad already patched', tree)
        else:
            print('MISS bad', tree)
    else:
        n = n.replace(bad_old, bad_new)
        print('OK bad', tree)
    n = n.replace('routeIsBad(plan, registry, visited)', 'routeIsBad(plan, registry, visited, body)')
    n = n.replace('routeIsBad(offline, registry, visited)', 'routeIsBad(offline, registry, visited, body)')
    n = n.replace("liveReason === 'short' || liveReason === 'hello'", "liveReason === 'short' || liveReason === 'hello' || liveReason === 'short-token'")
    nexus.write_text(n, encoding='utf-8')
    print('wrote', tree)
