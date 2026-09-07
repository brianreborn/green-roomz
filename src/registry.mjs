import { fileExists } from './util.mjs';
import { ValidationError } from './errors.mjs';
import { admitWhenTightOf, agentCanAdmit } from './memory.mjs';

function routingBehavior(alias) {
  if (alias === 'tool-router-agent') return 'nexus';
  if (alias === 'security-monitor-agent') return 'mailbox';
  if (alias === 'vision-layout-agent' || alias === 'audio-transcription-agent') return 'modality_override';
  return 'explicit';
}

function isResidentAgent(agent) {
  return Boolean(agent?.resident) || agent?.alias === 'tool-router-agent';
}

export class AgentRegistry {
  constructor(manifest) {
    this.manifest = manifest;
    this.agents = new Map(manifest.agents.map((agent) => [agent.alias, agent]));
    this.availability = new Map();
  }

  async inspect({ hostAdapter } = {}) {
    let freeMemoryBytes;
    try {
      freeMemoryBytes = hostAdapter?.sampleResources?.()?.freeMemoryBytes;
    } catch {
      freeMemoryBytes = undefined;
    }
    for (const agent of this.agents.values()) {
      const missing = [];
      if (agent.runtime !== 'logical') {
        const runtime = this.manifest.runtimes[agent.runtime];
        if (!(await fileExists(runtime.command))) missing.push(`runtime:${runtime.command}`);
      }
      for (const field of agent.required_artifacts ?? []) {
        if (!(await fileExists(agent[field]))) missing.push(`${field}:${agent[field] ?? '<unset>'}`);
      }
      let state = missing.length ? 'unavailable' : agent.runtime === 'logical' ? 'ready' : 'cold';
      let advisory;
      if (state === 'cold' && !isResidentAgent(agent)) {
        const admission = agentCanAdmit(agent, { freeMemoryBytes, admitWhenTight: admitWhenTightOf(this.manifest) });
        if (!admission.ok) {
          missing.push(`impractical:${admission.reason}`);
          state = 'unavailable';
        } else if (admission.pressure === 'tight') {
          advisory = `memory-tight: ~${admission.estimateBytes} est vs ${freeMemoryBytes} free (will page)`;
        }
      }
      this.availability.set(agent.alias, {
        state,
        missing,
        ...(advisory ? { advisory } : {}),
      });
    }
    return this;
  }

  get(alias) {
    const agent = this.agents.get(alias);
    if (!agent) throw new ValidationError(`Unknown agent alias: ${alias}`, { allowed: [...this.agents.keys()] });
    return agent;
  }

  status(alias) {
    return this.availability.get(alias) ?? { state: 'unknown', missing: [] };
  }

  setStatus(alias, state, extra = {}) {
    this.availability.set(alias, { ...this.status(alias), state, ...extra });
  }

  listModels() {
    return [...this.agents.values()].map((agent) => {
      const status = this.status(agent.alias);
      const callable = status.state === 'ready' || status.state === 'cold';
      const loaded = status.state === 'ready';
      return {
        id: agent.alias,
        object: 'model',
        owned_by: 'green-roomz',
        // Declared capabilities describe the configured model. Consumers that need
        // to make a request must use the status-qualified fields below.
        native_capabilities: agent.native_capabilities,
        gateway_accepted_capabilities: agent.gateway_accepted_capabilities,
        callable_capabilities: callable ? agent.native_capabilities : [],
        ready_capabilities: loaded ? agent.native_capabilities : [],
        capability_readiness: {
          state: status.state,
          callable,
          loaded,
          reasons: status.missing,
        },
        routing_behavior: routingBehavior(agent.alias),
        availability: status.state,
        unavailable_reasons: status.missing,
        experimental_features: agent.experimental ?? [],
        resident: Boolean(agent.resident) || agent.alias === 'tool-router-agent',
      };
    });
  }
}
