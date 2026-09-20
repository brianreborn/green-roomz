import { randomUUID } from 'node:crypto';
import { appendFileSync, mkdirSync, readdirSync, readFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { applyTurn, emptyWorkingSet, lookupWorkingSet, normalizePhase, setFactPhase } from './session-memory.mjs';

const SESSION_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sessionFile(dir, id) {
  if (!dir || !SESSION_ID_RE.test(id)) return null;
  return path.join(dir, `${id}.jsonl`);
}

function hydrate(row) {
  if (!row || typeof row !== 'object' || !SESSION_ID_RE.test(String(row.id ?? ''))) return null;
  return {
    id: String(row.id),
    identity: row.identity,
    agentAlias: row.agentAlias ?? null,
    modality: row.modality ?? {},
    faith: row.faith ?? 'medium',
    confidenceMood: row.confidenceMood ?? 'will',
    fear: row.fear ?? 'low',
    yolo: Boolean(row.yolo),
    op: row.op ?? null,
    rebuke: row.rebuke ?? null,
    councilDefault: row.councilDefault,
    facts: Array.isArray(row.facts) ? row.facts.map((fact) => ({ ...fact, phase: normalizePhase(fact?.phase) })) : [],
    transcript: Array.isArray(row.transcript) ? row.transcript.map((turn) => ({ ...turn })) : [],
    lastSpecialist: row.lastSpecialist ?? row.agentAlias ?? null,
    createdAt: Number(row.createdAt) || 0,
    lastAccess: Number(row.lastAccess) || 0,
    expiresAt: Number(row.expiresAt) || 0,
  };
}

function readLatestSnapshot(file) {
  let raw;
  try { raw = readFileSync(file, 'utf8'); } catch { return null; }
  const lines = String(raw).split('\n');
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i].trim();
    if (!line) continue;
    try { return hydrate(JSON.parse(line)); } catch { /* skip a corrupt line */ }
  }
  return null;
}

export class SessionLedger {
  constructor({ ttlMs = 3_600_000, limit = 64, clock = Date.now, persistDir = null } = {}) {
    this.ttlMs = ttlMs;
    this.limit = limit;
    this.clock = clock;
    this.entries = new Map();
    this.persistDir = persistDir ? path.resolve(String(persistDir)) : null;
    if (this.persistDir) {
      mkdirSync(this.persistDir, { recursive: true });
      this.loadPersisted();
    }
  }

  create({ identity, agentAlias, modality, faith = 'medium', confidenceMood = 'will', fear = 'low', yolo = false } = {}) {
    this.expire();
    while (this.entries.size >= this.limit) this.evictOldest();
    const id = randomUUID();
    const now = this.clock();
    const memory = emptyWorkingSet();
    memory.lastSpecialist = agentAlias ?? null;
    const entry = {
      id, identity, agentAlias, modality, faith, confidenceMood, fear, yolo,
      op: null, rebuke: null,
      facts: memory.facts, transcript: memory.transcript, lastSpecialist: memory.lastSpecialist,
      createdAt: now, lastAccess: now, expiresAt: now + this.ttlMs,
    };
    this.entries.set(id, entry);
    this.persist(entry);
    return id;
  }

  get(id, identity) {
    if (!id) return undefined;
    this.expire();
    const entry = this.entries.get(id);
    if (!entry || entry.identity !== identity) return undefined;
    const now = this.clock();
    entry.lastAccess = now;
    entry.expiresAt = now + this.ttlMs;
    this.persist(entry);
    return {
      ...entry,
      facts: (entry.facts ?? []).map((fact) => ({ ...fact })),
      transcript: (entry.transcript ?? []).map((turn) => ({ ...turn })),
      lastSpecialist: entry.lastSpecialist ?? entry.agentAlias ?? null,
    };
  }

  workingSet(id) {
    return this.lookup(id, { includePartitioned: false });
  }

  lookup(id, { includePartitioned = false } = {}) {
    if (!id) return null;
    const entry = this.entries.get(id);
    if (!entry) return null;
    return lookupWorkingSet({
      facts: entry.facts,
      transcript: entry.transcript,
      lastSpecialist: entry.lastSpecialist ?? entry.agentAlias ?? null,
    }, { includePartitioned });
  }

  setPhase(id, pred, phase) {
    const entry = this.entries.get(id);
    if (!entry) return false;
    const n = setFactPhase(entry.facts ?? [], pred, phase);
    if (!n) return false;
    const now = this.clock();
    entry.lastAccess = now;
    entry.expiresAt = now + this.ttlMs;
    this.persist(entry);
    return true;
  }

  partitionFact(id, pred) {
    return this.setPhase(id, pred, 'partition');
  }

  containFact(id, pred) {
    return this.setPhase(id, pred, 'containment');
  }

  releaseFact(id, pred) {
    return this.setPhase(id, (fact) => {
      if (normalizePhase(fact.phase) !== 'containment') return false;
      if (typeof pred === 'function') return Boolean(pred(fact));
      if (typeof pred === 'string') return fact.key === pred;
      return false;
    }, 'partition');
  }

  setAgentAlias(id, agentAlias) {
    return this.patch(id, { agentAlias });
  }

  rememberTurn(id, turn, bounds) {
    const entry = this.entries.get(id);
    if (!entry) return false;
    const next = applyTurn({
      facts: entry.facts,
      transcript: entry.transcript,
      lastSpecialist: entry.lastSpecialist ?? entry.agentAlias ?? null,
    }, turn, bounds);
    entry.facts = next.facts;
    entry.transcript = next.transcript;
    entry.lastSpecialist = next.lastSpecialist;
    if (turn?.agentAlias && turn.agentAlias !== 'tool-router-agent') entry.agentAlias = turn.agentAlias;
    const now = this.clock();
    entry.lastAccess = now;
    entry.expiresAt = now + this.ttlMs;
    this.persist(entry);
    return true;
  }

  patch(id, fields) {
    const entry = this.entries.get(id);
    if (!entry) return false;
    const allow = new Set(['faith', 'fear', 'confidenceMood', 'yolo', 'councilDefault', 'op', 'rebuke', 'agentAlias', 'lastAccess', 'lastSpecialist']);
    for (const [key, value] of Object.entries(fields ?? {})) {
      if (allow.has(key)) entry[key] = value;
    }
    const now = this.clock();
    entry.lastAccess = now;
    entry.expiresAt = now + this.ttlMs;
    this.persist(entry);
    return true;
  }

  expire() {
    const now = this.clock();
    for (const [id, entry] of this.entries) {
      if (entry.expiresAt <= now) {
        this.entries.delete(id);
        this.forgetFile(id);
      }
    }
  }

  evictOldest() {
    let oldest;
    for (const entry of this.entries.values()) {
      if (!oldest || entry.lastAccess < oldest.lastAccess || (entry.lastAccess === oldest.lastAccess && entry.id < oldest.id)) oldest = entry;
    }
    if (oldest) {
      this.entries.delete(oldest.id);
      this.forgetFile(oldest.id);
    }
  }

  persist(entry) {
    if (!this.persistDir || !entry) return;
    const file = sessionFile(this.persistDir, entry.id);
    if (!file) return;
    const row = {
      id: entry.id,
      identity: entry.identity,
      agentAlias: entry.agentAlias ?? null,
      lastSpecialist: entry.lastSpecialist ?? entry.agentAlias ?? null,
      facts: entry.facts ?? [],
      transcript: entry.transcript ?? [],
      faith: entry.faith,
      confidenceMood: entry.confidenceMood,
      fear: entry.fear,
      yolo: Boolean(entry.yolo),
      op: entry.op ?? null,
      rebuke: entry.rebuke ?? null,
      councilDefault: entry.councilDefault,
      modality: entry.modality ?? {},
      createdAt: entry.createdAt,
      lastAccess: entry.lastAccess,
      expiresAt: entry.expiresAt,
    };
    appendFileSync(file, `${JSON.stringify(row)}\n`);
  }

  forgetFile(id) {
    const file = sessionFile(this.persistDir, id);
    if (!file) return;
    try { unlinkSync(file); } catch { /* already gone */ }
  }

  loadPersisted() {
    let names;
    try { names = readdirSync(this.persistDir); } catch { return; }
    const now = this.clock();
    for (const name of names) {
      if (!name.endsWith('.jsonl')) continue;
      const id = name.slice(0, -'.jsonl'.length);
      const file = sessionFile(this.persistDir, id);
      if (!file) continue;
      const entry = readLatestSnapshot(file);
      if (!entry || entry.expiresAt <= now) {
        this.forgetFile(id);
        continue;
      }
      this.entries.set(entry.id, entry);
    }
    while (this.entries.size > this.limit) this.evictOldest();
  }
}
