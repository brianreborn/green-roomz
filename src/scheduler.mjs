import { POLICIES } from './constants.mjs';

export class PolicyGate {
  constructor(policy = 'responsive') {
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
    if (signal?.aborted) throw signal.reason ?? new Error('aborted');
    if (this.active < this.maximum) {
      this.active += 1;
      return () => this.release();
    }
    return new Promise((resolve, reject) => {
      const item = { resolve, reject, signal, settled: false };
      const settle = (fn) => {
        if (item.settled) return;
        item.settled = true;
        fn();
      };
      this.queue.push(item);
      signal?.addEventListener('abort', () => {
        this.queue = this.queue.filter((entry) => entry !== item);
        settle(() => reject(signal.reason ?? new Error('aborted')));
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
      if (item.settled) continue;
      if (item.signal?.aborted) {
        item.settled = true;
        item.reject(item.signal.reason ?? new Error('aborted'));
        continue;
      }
      this.active += 1;
      item.settled = true;
      item.resolve(() => this.release());
    }
  }
}
