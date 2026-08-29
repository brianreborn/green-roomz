import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { digestObject } from '../util.mjs';

const execFileAsync = promisify(execFile);

export class WindowsHostAdapter {
  constructor({ runtimeCommand } = {}) {
    this.runtimeCommand = runtimeCommand;
    this.kind = process.platform === 'win32' ? 'windows' : process.platform;
  }

  async fingerprint() {
    const cpus = os.cpus();
    let runtime = null;
    let devices = null;
    if (this.runtimeCommand) {
      try {
        runtime = (await execFileAsync(this.runtimeCommand, ['--version'], { windowsHide: true, timeout: 10_000 })).stdout.trim();
        devices = (await execFileAsync(this.runtimeCommand, ['--list-devices'], { windowsHide: true, timeout: 10_000 })).stdout.trim();
      } catch (error) {
        runtime = `probe-failed:${error.code ?? error.message}`;
      }
    }
    const details = {
      kind: this.kind,
      platform: os.platform(),
      release: os.release(),
      arch: os.arch(),
      cpuModel: cpus[0]?.model ?? 'unknown',
      logicalCpus: cpus.length,
      totalMemoryBytes: os.totalmem(),
      runtime,
      devices,
    };
    return { id: digestObject(details), details };
  }

  applyPriority(child) {
    try {
      os.setPriority(child.pid, os.constants.priority.PRIORITY_BELOW_NORMAL);
      return true;
    } catch {
      return false;
    }
  }

  sampleResources() {
    return { totalMemoryBytes: os.totalmem(), freeMemoryBytes: os.freemem(), loadAverage: os.loadavg() };
  }
}
