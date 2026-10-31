import fs from 'node:fs';
import path from 'node:path';

export class Store {
  constructor(dir) { this.dir = dir; fs.mkdirSync(dir, {recursive: true, mode: 0o700}); fs.chmodSync(dir, 0o700); }
  read(name, fallback = null) {
    try { return JSON.parse(fs.readFileSync(path.join(this.dir, `${name}.json`), 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return fallback; throw new Error(`Cannot read ${name}.json; restore it before restarting.`); }
  }
  write(name, value) {
    const target = path.join(this.dir, `${name}.json`), temp = `${target}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(value, null, 2), {mode: 0o600});
    fs.chmodSync(temp, 0o600); fs.renameSync(temp, target);
  }
}
