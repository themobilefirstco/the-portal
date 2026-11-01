import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';

export class KeychainStore {
  constructor(dataDir, {helper = fileURLToPath(new URL('../runtime/portal-keychain', import.meta.url)), run = execFileSync, noPrompt = process.env.PORTAL_NON_INTERACTIVE === '1'} = {}) {
    this.helper = helper; this.run = run; this.noPrompt = noPrompt;
    this.service = `org.theportal.room.${crypto.createHash('sha256').update(path.resolve(dataDir)).digest('hex').slice(0, 24)}`;
  }
  request(operation, account, value) {
    try {
      return this.run(this.helper, [], {input: JSON.stringify({operation, noPrompt: this.noPrompt, service: this.service, account, ...(value === undefined ? {} : {value: JSON.stringify(value)})}), encoding: 'utf8', timeout: 30_000, stdio: ['pipe', 'pipe', 'pipe']}).trim();
    } catch { throw new Error('The Portal could not access macOS Keychain. Run setup, unlock your login keychain, and allow the Portal helper when macOS asks.'); }
  }
  read(name, fallback = null) { const result = JSON.parse(this.request('read', name) || 'null'); return result ?? fallback; }
  write(name, value) { this.request(value === null ? 'delete' : 'write', name, value); }
}

// Only synthetic, no-browser integration tests use this store. Never persist it.
export class MemorySecrets {
  constructor() { this.values = new Map(); }
  read(name, fallback = null) { return this.values.get(name) ?? fallback; }
  write(name, value) { this.values.set(name, value); }
}
