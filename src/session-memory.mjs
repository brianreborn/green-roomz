/**
 * MFL-17 bounded-context injection seam.
 * Session working set: facts + last specialist + compact transcript.
 * Clip is a character budget from agent.context_size (Athlon 4096); no tokenizer.
 * Fact phase: attention (inject) | partition (authorized lookup) | containment (stored, no recall).
 */
export const CHARS_PER_TOKEN = 4;
export const MEMORY_BLOCK_MARKER = 'MEMORY (inherited; origin=session; bounded):';
export const MEMORY_PHASES = Object.freeze(['attention', 'partition', 'containment']);

const PHASE_MOVES = Object.freeze({
  attention: Object.freeze(['partition']),
  partition: Object.freeze(['attention', 'containment']),
  containment: Object.freeze(['partition']),
});

const NAME_CUE = /\b(?:my name is|call me|i['’]m|i am)\s+([A-Za-z][A-Za-z0-9_-]{1,31})\b/gi;
const NAME_STOP = new Set([
  'a', 'an', 'the', 'going', 'here', 'there', 'not', 'just', 'very', 'happy',
  'fine', 'good', 'ok', 'okay', 'user', 'trying', 'looking', 'asking',
]);

export function memoryBounds(gateway = {}) {
  return {
    transcriptChars: Number(gateway.memory_transcript_chars),
    factsLimit: Number(gateway.memory_facts_limit),
  };
}

export function contextCharBudget(agent, { maxTokens, systemChars } = {}) {
  const ctx = Number(agent?.context_size);
  const ctxTokens = Number.isFinite(ctx) && ctx > 0 ? ctx : 4096;
  const rawMax = Number(maxTokens);
  const completion = Number.isFinite(rawMax) && rawMax > 0 ? rawMax : 96;
  const sysTokens = Math.ceil((Number(systemChars) || 0) / CHARS_PER_TOKEN);
  const available = ctxTokens - completion - sysTokens - 8;
  return Math.max(256, available) * CHARS_PER_TOKEN;
}

export function contentChars(message) {
  if (typeof message?.content === 'string') return message.content.length;
  if (!Array.isArray(message?.content)) return 0;
  return message.content.reduce((n, part) => {
    if (typeof part === 'string') return n + part.length;
    if (typeof part?.text === 'string') return n + part.text.length;
    return n;
  }, 0);
}

export function clipText(text, maxChars) {
  const s = String(text ?? '');
  const n = Number(maxChars);
  if (!Number.isFinite(n) || n <= 0) return '';
  if (s.length <= n) return s;
  return s.slice(s.length - n);
}

function turnLine(turn) {
  const role = turn?.role === 'assistant' ? 'assistant' : 'user';
  return `${role}: ${String(turn?.text ?? '')}`;
}

export function clipTranscript(turns, maxChars) {
  const list = Array.isArray(turns) ? turns : [];
  const cap = Number(maxChars);
  if (!Number.isFinite(cap) || cap <= 0) return [];
  const kept = [];
  let used = 0;
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const role = list[i]?.role === 'assistant' ? 'assistant' : 'user';
    let text = String(list[i]?.text ?? '');
    const sep = kept.length ? 1 : 0;
    let line = `${role}: ${text}`;
    if (used + sep + line.length > cap) {
      if (kept.length === 0) {
        const room = cap - role.length - 2;
        if (room <= 0) break;
        text = clipText(text, room);
        kept.unshift({ role, text });
      }
      break;
    }
    used += sep + line.length;
    kept.unshift({ role, text });
  }
  return kept;
}

export function extractFacts(text) {
  const facts = [];
  const raw = String(text ?? '');
  NAME_CUE.lastIndex = 0;
  let match;
  while ((match = NAME_CUE.exec(raw))) {
    const value = String(match[1] ?? '').trim();
    if (!value || NAME_STOP.has(value.toLowerCase())) continue;
    facts.push({ key: 'user_name', value, origin: 'user' });
  }
  return facts;
}

export function normalizePhase(phase) {
  return MEMORY_PHASES.includes(phase) ? phase : 'attention';
}

function matchFact(fact, pred) {
  if (typeof pred === 'function') return Boolean(pred(fact));
  if (typeof pred === 'string') return fact?.key === pred;
  return false;
}

function phaseVisible(fact, includePartitioned) {
  const phase = normalizePhase(fact?.phase);
  if (phase === 'containment') return false;
  if (phase === 'partition') return Boolean(includePartitioned);
  return true;
}

export function lookupWorkingSet(state, { includePartitioned = false } = {}) {
  if (!state) return emptyWorkingSet();
  return {
    facts: (state.facts ?? [])
      .filter((fact) => phaseVisible(fact, includePartitioned))
      .map((fact) => ({ ...fact, phase: normalizePhase(fact.phase) })),
    transcript: (state.transcript ?? []).map((turn) => ({ ...turn })),
    lastSpecialist: state.lastSpecialist ?? null,
  };
}

export function setFactPhase(facts, pred, phase) {
  const target = String(phase ?? '');
  if (!MEMORY_PHASES.includes(target)) return 0;
  const list = Array.isArray(facts) ? facts : [];
  let n = 0;
  for (const fact of list) {
    if (!matchFact(fact, pred)) continue;
    const from = normalizePhase(fact.phase);
    if (from === target) continue;
    if (!PHASE_MOVES[from].includes(target)) continue;
    fact.phase = target;
    n += 1;
  }
  return n;
}

function upsertFact(facts, fact, limit) {
  const cap = Number.isFinite(Number(limit)) && Number(limit) > 0 ? Number(limit) : 1;
  const i = facts.findIndex((row) => row.key === fact.key);
  const phase = i >= 0 ? normalizePhase(facts[i].phase) : normalizePhase(fact.phase);
  const row = { key: fact.key, value: fact.value, origin: fact.origin ?? 'user', phase };
  if (i >= 0) facts[i] = row;
  else facts.push(row);
  while (facts.length > cap) facts.shift();
}

export function emptyWorkingSet() {
  return { facts: [], transcript: [], lastSpecialist: null };
}

export function applyTurn(state, turn = {}, bounds = {}) {
  const next = {
    facts: [...(state?.facts ?? [])],
    transcript: [...(state?.transcript ?? [])],
    lastSpecialist: state?.lastSpecialist ?? null,
  };
  const alias = turn.agentAlias;
  if (alias && alias !== 'tool-router-agent') next.lastSpecialist = alias;
  const userText = turn.userText != null ? String(turn.userText) : '';
  const assistantText = turn.assistantText != null ? String(turn.assistantText) : '';
  if (userText) {
    for (const fact of extractFacts(userText)) upsertFact(next.facts, fact, bounds.factsLimit);
    const last = next.transcript[next.transcript.length - 1];
    if (!(last?.role === 'user' && last.text === userText)) {
      next.transcript.push({ role: 'user', text: userText });
    }
  }
  if (assistantText) {
    const last = next.transcript[next.transcript.length - 1];
    if (!(last?.role === 'assistant' && last.text === assistantText)) {
      next.transcript.push({ role: 'assistant', text: assistantText });
    }
  }
  next.transcript = clipTranscript(next.transcript, bounds.transcriptChars);
  return next;
}

export function formatWorkingSet(state) {
  const visible = lookupWorkingSet(state);
  if (!visible.facts.length && !visible.transcript.length && !visible.lastSpecialist) return '';
  const lines = [MEMORY_BLOCK_MARKER];
  if (visible.lastSpecialist) lines.push(`last specialist: ${visible.lastSpecialist}`);
  for (const fact of visible.facts) lines.push(`${fact.key}: ${fact.value}`);
  for (const turn of visible.transcript) lines.push(turnLine(turn));
  return lines.join('\n');
}

export function formatMemoryHeader(state) {
  if (!state) return 'facts=0;chars=0';
  const visible = lookupWorkingSet(state);
  const facts = visible.facts.length;
  const chars = visible.transcript.reduce((n, turn) => n + turnLine(turn).length + 1, 0);
  const specialist = visible.lastSpecialist ? `;specialist=${visible.lastSpecialist}` : '';
  return `facts=${facts};chars=${chars}${specialist}`;
}

export function clipMessages(messages, maxChars) {
  const list = Array.isArray(messages) ? messages : [];
  const cap = Number(maxChars);
  if (!Number.isFinite(cap) || cap <= 0) return list.slice(-1);
  const systems = [];
  const rest = [];
  for (const message of list) {
    if (message?.role === 'system' && rest.length === 0) systems.push(message);
    else rest.push(message);
  }
  let used = systems.reduce((n, message) => n + contentChars(message), 0);
  if (used > cap && systems.length) {
    const last = systems[systems.length - 1];
    if (typeof last.content === 'string') {
      systems[systems.length - 1] = { ...last, content: clipText(last.content, Math.max(0, cap)) };
    }
    return systems;
  }
  const kept = [];
  for (let i = rest.length - 1; i >= 0; i -= 1) {
    const message = rest[i];
    const size = contentChars(message);
    if (used + size <= cap) {
      kept.unshift(message);
      used += size;
      continue;
    }
    if (kept.length === 0) {
      if (typeof message?.content === 'string') {
        kept.unshift({ ...message, content: clipText(message.content, Math.max(0, cap - used)) });
      } else {
        kept.unshift(message);
      }
    }
    break;
  }
  return [...systems, ...kept];
}

export function injectWorkingSet(messages, state, { maxChars } = {}) {
  const list = Array.isArray(messages) ? [...messages] : [];
  const block = formatWorkingSet(state);
  if (block && !list.some((message) => message?.role === 'system' && String(message.content ?? '').includes(MEMORY_BLOCK_MARKER))) {
    let insertAt = 0;
    while (insertAt < list.length && list[insertAt]?.role === 'system') insertAt += 1;
    list.splice(insertAt, 0, { role: 'system', content: block });
  }
  return clipMessages(list, maxChars);
}
