/**
 * Import Green-Brainz by GREEN_BRAINZ_ROOT. Never vendor-copy Agentz into this tree.
 * Unset → gateway runs without cognitive memory (tests stay skip-clean).
 */
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function brainzRoot(env = process.env) {
  const raw = env.GREEN_BRAINZ_ROOT;
  if (!raw || !String(raw).trim()) return null;
  return resolve(String(raw).trim());
}

export async function loadOptionalBrainz({
  env = process.env,
  directory = env.GREEN_BRAINZ_STORE,
  actorAgentId = 'green-roomz',
} = {}) {
  const root = brainzRoot(env);
  if (!root) return { enabled: false, reason: 'GREEN_BRAINZ_ROOT unset' };
  const loadPath = join(root, 'host', 'load.mjs');
  const hostPath = join(root, 'host', 'cognitive-host.mjs');
  const entry = existsSync(loadPath) ? loadPath : hostPath;
  if (!existsSync(entry)) {
    return { enabled: false, reason: `brainz host missing under ${root}` };
  }
  const mod = await import(pathToFileURL(entry).href);
  const storeDir = directory || join(process.cwd(), 'data', 'dreamcatcher');
  const host = await mod.CognitiveHost.open({ directory: storeDir, actorAgentId });
  const interrupts = new mod.InterruptController();
  return {
    enabled: true,
    reason: null,
    root,
    storeDir,
    host,
    interrupts,
    CognitiveHost: mod.CognitiveHost,
    InterruptController: mod.InterruptController,
  };
}
