import { POLICIES } from './constants.mjs';

export class PolicyGate {
  constructor(policy = 'maximize') {
    this.setPolicy(policy);
    this.active = 0;
    this.queue = [];
  }

  setPolicy(policy) {
    if (!POLICIES[policy]) throw new Error(`Unknown policy: ${policy}`);
    this.policy = policy;
    this.maximum = POLICIES[policy].maxHeavyInFlight;
    this.drain();
  }

  async acquire(signal) {
    if (this.active < this.maximum) {
      this.active += 1;
      return () => this.release();
    }
    return new Promise((resolve, reject) => {
      const item = { resolve, reject, signal };
      this.queue.push(item);
      signal?.addEventListener('abort', () => {
        this.queue = this.queue.filter((entry) => entry !== item);
        reject(signal.reason ?? new Error('aborted'));
      }, { once: true });
    });
  }

  release() {
    this.active = Math.max(0, this.active - 1);
    this.drain();
  }

  drain() {
    while (this.queue?.length && this.active < this.maximum) {
      const item = this.queue.shift();
      if (item.signal?.aborted) continue;
      this.active += 1;
      item.resolve(() => this.release());
    }
  }
}
