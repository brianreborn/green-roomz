import { randomUUID } from 'node:crypto';

export class SessionLedger {
  constructor({ ttlMs = 3_600_000, limit = 2048, clock = Date.now } = {}) {
    this.ttlMs = ttlMs;
    this.limit = limit;
    this.clock = clock;
    this.entries = new Map();
  }

  create({ identity, agentAlias, modality }) {
    this.expire();
    while (this.entries.size >= this.limit) this.evictOldest();
    const id = randomUUID();
    const now = this.clock();
    this.entries.set(id, { id, identity, agentAlias, modality, createdAt: now, lastAccess: now, expiresAt: now + this.ttlMs });
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
    return { ...entry };
  }

  setAgentAlias(id, agentAlias) {
    const entry = this.entries.get(id);
    if (!entry) return false;
    entry.agentAlias = agentAlias;
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
