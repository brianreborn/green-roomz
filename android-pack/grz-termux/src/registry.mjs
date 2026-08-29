import { fileExists } from './util.mjs';
import { ValidationError } from './errors.mjs';
import { agentCanAdmit } from './memory.mjs';

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
      if (state === 'cold' && !isResidentAgent(agent)) {
        const admission = agentCanAdmit(agent, { freeMemoryBytes });
        if (false) {
          state = 'unavailable';
          missing.push(`impractical:${admission.reason}:estimate ${admission.estimateBytes} + headroom ${admission.headroomBytes} > free ${freeMemoryBytes}`);
        }
      }
      this.availability.set(agent.alias, {
        state,
        missing,
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
      return {
        id: agent.alias,
        object: 'model',
        owned_by: 'green-roomz',
        native_capabilities: agent.native_capabilities,
        gateway_accepted_capabilities: agent.gateway_accepted_capabilities,
        routing_behavior: routingBehavior(agent.alias),
        availability: status.state,
        unavailable_reasons: status.missing,
        experimental_features: agent.experimental ?? [],
        resident: Boolean(agent.resident) || agent.alias === 'tool-router-agent',
      };
    });
  }
}


