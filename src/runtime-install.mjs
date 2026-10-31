import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export function installRuntime(source, destination, {copyFile = fs.copyFileSync} = {}) {
  if (fs.realpathSync(source) === path.resolve(destination)) return;
  const staged = path.join(path.dirname(destination), `.node-${crypto.randomUUID()}.tmp`);
  try {
    // Never truncate an executable that the current controller may still use.
    copyFile(source, staged);
    fs.chmodSync(staged, 0o755);
    fs.renameSync(staged, destination);
  } finally {
    fs.rmSync(staged, {force: true});
  }
}
