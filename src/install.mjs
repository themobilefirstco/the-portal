import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {startService} from './service-start.mjs';
import {deploy} from './deployment.mjs';
import {KeychainStore} from './secrets.mjs';
import {VERSION} from './config.mjs';

if (process.platform !== 'darwin') throw new Error('The Portal currently supports macOS only.');
const source = fileURLToPath(new URL('..', import.meta.url));
const root = path.join(os.homedir(), 'Library/Application Support/The Portal');
const app = path.join(root, 'app'), state = path.join(root, 'state');
const label = 'org.theportal.room', domain = `gui/${process.getuid()}`;
const plist = path.join(os.homedir(), 'Library/LaunchAgents', `${label}.plist`);
const launch = (...args) => spawnSync('/bin/launchctl', args, {encoding: 'utf8', timeout: 15_000});
const loaded = () => launch('print', `${domain}/${label}`).status === 0;
const stop = async () => {
  if (!loaded()) return;
  if (launch('bootout', `${domain}/${label}`).status !== 0) throw new Error('Could not stop The Portal. Existing installation preserved.');
};
if (process.argv.includes('--stop')) {
  await stop(); fs.rmSync(plist, {force: true});
  console.log('The Portal stopped. Login startup disabled. Settings and Keychain credentials preserved.'); process.exit(0);
}
const unlock = new KeychainStore(state, {helper: path.join(source, 'runtime/portal-keychain')});
const controlKey = unlock.read('control-key');
if (loaded()) {
  try {
    const response = await fetch('http://127.0.0.1:4280/api/status', {headers: {'x-room-token': controlKey || ''}, signal: AbortSignal.timeout(3000)});
    if (!response.ok) throw new Error('The running controller could not be authenticated.');
    if ((await response.json()).active) throw new Error('A meeting is active. Run setup again after leaving the call.');
  } catch (error) { throw new Error(`Update stopped before changing files: ${error.message}`); }
}
const xml = s => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
fs.mkdirSync(state, {recursive: true, mode: 0o700});
fs.mkdirSync(path.dirname(plist), {recursive: true});
const doc = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>${label}</string>
<key>ProgramArguments</key><array><string>${xml(path.join(app,'runtime/node'))}</string><string>${xml(path.join(app,'src/server.mjs'))}</string></array>
<key>WorkingDirectory</key><string>${xml(app)}</string>
<key>EnvironmentVariables</key><dict><key>PORTAL_DATA_DIR</key><string>${xml(state)}</string></dict>
<key>RunAtLoad</key><true/><key>KeepAlive</key><true/>
<key>LimitLoadToSessionType</key><string>Aqua</string><key>ThrottleInterval</key><integer>15</integer>
<key>StandardOutPath</key><string>${xml(path.join(root,'controller.log'))}</string>
<key>StandardErrorPath</key><string>${xml(path.join(root,'controller-error.log'))}</string>
</dict></plist>`;
const priorPlist = fs.existsSync(plist) ? fs.readFileSync(plist) : null;
fs.writeFileSync(plist, doc, {mode: 0o600});
if (spawnSync('/usr/bin/plutil', ['-lint', plist]).status !== 0) throw new Error('Invalid service definition.');
try {
  await deploy({source, destination: app, stop,
    entries: ['src', 'web', 'package.json', 'runtime/node', 'runtime/portal-keychain', 'runtime/NODE-LICENSE'],
    start: () => startService({launch, domain, label, plist}),
    verify: async () => {
      for (let i = 0; i < 40; i++) {
        try { const r = await fetch('http://127.0.0.1:4280/health', {signal: AbortSignal.timeout(1000)});
          const h = await r.json(); if (r.ok && h.app === 'the-portal' && h.version === VERSION && h.controllerLastTick) return; } catch {}
        await delay(500);
      }
      throw new Error('The new controller did not become ready.');
    }});
} catch (error) {
  if (priorPlist) fs.writeFileSync(plist, priorPlist); else fs.rmSync(plist, {force: true});
  throw error;
}
console.log(`The Portal ${VERSION} installed. It starts after this Mac user logs in.`);
await import('./open.mjs');
