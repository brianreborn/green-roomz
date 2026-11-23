import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.argv[2];
const src = path.join(root, 'config', 'agents.windows.json');
const dest = path.join(root, 'data', 'serve-vulkan-all-4b.json');
const manifest = JSON.parse(await readFile(src, 'utf8'));
manifest.gateway.port = 18080;
manifest.gateway.cold_start_timeout_ms = 180000;
for (const agent of manifest.agents) {
  if (Array.isArray(agent.profiles) && agent.profiles.length) {
    const vulkan = agent.profiles.find((p) => p.id === 'vulkan-all');
    agent.profiles = vulkan ? [vulkan] : agent.profiles.slice(-1);
  }
  if (agent.alias === 'general-text-speculator') {
    agent.context_size = 1024;
    agent.draft_enabled = false;
  }
  if (agent.alias === 'code-generation-agent') {
    agent.context_size = 1024;
  }
}
await writeFile(dest, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
console.log(dest);
