import { createWriteStream, mkdirSync } from 'node:fs';
import path from 'node:path';
import fs from 'node:fs';

const sysStdoutFd = 1;
const sysStderrFd = 2;

function hook(type, target) {
  const stream = process[type];
  const originalWrite = stream.write;
  
  stream.write = function (chunk, encoding, callback) {
    try {
      fs.writeSync(type === 'stdout' ? sysStdoutFd : sysStderrFd, chunk);
    } catch (e) {}
    
    if (target && typeof target.write === 'function') {
      return target.write.apply(target, arguments);
    }
    return originalWrite.apply(stream, arguments);
  };
}

export function attachServeConsole(dir, logName = 'serve.log') {
  const targetDir = typeof dir === 'object' && dir?.dir ? dir.dir : (typeof dir === 'string' ? dir : './data');
  mkdirSync(targetDir, { recursive: true });
  const logPath = path.join(targetDir, logName);
  const file = createWriteStream(logPath, { flags: 'a' });
  hook('stdout', file);
  hook('stderr', file);
}

export function createLogger(dir, logName = 'system.log') {
  const targetDir = typeof dir === 'object' && dir?.dir ? dir.dir : (typeof dir === 'string' ? dir : './data');
  mkdirSync(targetDir, { recursive: true });
  const logPath = path.join(targetDir, logName);
  const file = createWriteStream(logPath, { flags: 'a' });
  
  const log = (level, msg) => {
    const output = `[${new Date().toISOString()}] [${level.toUpperCase()}] ${msg}\n`;
    try {
      fs.writeSync(sysStdoutFd, output);
    } catch (e) {}
    file.write(output);
  };

  return {
    info: (msg) => log('info', msg),
    warn: (msg) => log('warn', msg),
    error: (msg) => log('error', msg),
    debug: (msg) => log('debug', msg)
  };
}
