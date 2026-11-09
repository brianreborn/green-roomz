// G1 (Race on #41): mvp-startup / mvp-maintenance must unregister the pre-rename
// scheduled tasks and migrate the pre-rename startup state file. Static checks
// only — pwsh is not required on this host.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const startup = readFileSync(path.join(root, 'deploy/win-host/mvp-startup.ps1'), 'utf8');
const maintenance = readFileSync(path.join(root, 'deploy/win-host/mvp-maintenance.ps1'), 'utf8');

test('G1: mvp-startup unregisters GrzMvpAutoHeal and the pre-rename auto-heal task', () => {
  assert.match(startup, /GrzMvpAutoHeal/);
  assert.match(startup, /QodeshAutoHeal/);
  assert.match(startup, /Unregister-ScheduledTask/);
});

test('G1: mvp-maintenance unregisters GrzMvpMaintenance and the pre-rename maintenance task', () => {
  assert.match(maintenance, /GrzMvpMaintenance/);
  assert.match(maintenance, /QodeshMaintenance/);
  assert.match(maintenance, /Unregister-ScheduledTask/);
});

test('G1: mvp-startup migrates legacy startup state when the new file is missing', () => {
  assert.match(startup, /GRZ_LEGACY_STARTUP_STATE_FILE/);
  assert.match(startup, /Copy-Item/);
  assert.match(startup, /Migrated startup state from legacy file/);
  // Privacy: the old host token must not appear as its own word in the script.
  assert.equal(/\bqodesh\b/i.test(startup), false);
});
