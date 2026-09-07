import { randomUUID } from 'node:crypto';
import { applyTurn, emptyWorkingSet } from './session-memory.mjs';

export class SessionLedger {
  constructor({ ttlMs = 3_600_000, limit = 64, clock = Date.now } = {}) {
    this.ttlMs = ttlMs;
    this.limit = limit;
    this.clock = clock;
    this.entries = new Map();
  }

  create({ identity, agentAlias, modality, faith = 'medium', confidenceMood = 'will', fear = 'low', yolo = false } = {}) {
    this.expire();
    while (this.entries.size >= this.limit) this.evictOldest();
    const id = randomUUID();
    const now = this.clock();
    const memory = emptyWorkingSet();
    memory.lastSpecialist = agentAlias ?? null;
    this.entries.set(id, {
      id, identity, agentAlias, modality, faith, confidenceMood, fear, yolo,
      op: null, rebuke: null,
      facts: memory.facts, transcript: memory.transcript, lastSpecialist: memory.lastSpecialist,
      createdAt: now, lastAccess: now, expiresAt: now + this.ttlMs,
    });
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
    return {
      ...entry,
      facts: (entry.facts ?? []).map((fact) => ({ ...fact })),
      transcript: (entry.transcript ?? []).map((turn) => ({ ...turn })),
      lastSpecialist: entry.lastSpecialist ?? entry.agentAlias ?? null,
    };
  }

  workingSet(id) {
    if (!id) return null;
    const entry = this.entries.get(id);
    if (!entry) return null;
    return {
      facts: (entry.facts ?? []).map((fact) => ({ ...fact })),
      transcript: (entry.transcript ?? []).map((turn) => ({ ...turn })),
      lastSpecialist: entry.lastSpecialist ?? entry.agentAlias ?? null,
    };
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
    return true;
  }

  expire() {
    const now = this.clock();
    for (const [id, entry] of this.entries) if (entry.expiresAt <= now) this.entries.delete(id);
  }

  evictOldest() {
    let oldest;
    for (const entry of this.entries.values()) {
      if (!oldest || entry.lastAccess < oldest.lastAccess || (entry.lastAccess === oldest.lastAccess && entry.id < oldest.id)) oldest = entry;
    }
    if (oldest) this.entries.delete(oldest.id);
  }
}
