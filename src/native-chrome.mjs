import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const run = promisify(execFile);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

export function nativeChromeArguments(executable, profile, profileDirectory) {
  const suffix = '/Contents/MacOS/Google Chrome';
  if (!executable.endsWith(suffix)) throw new Error('The room needs the installed Google Chrome application.');
  return ['-n', '-a', executable.slice(0, -suffix.length), '--args',
    `--user-data-dir=${profile}`, `--profile-directory=${profileDirectory}`,
    '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0',
    '--no-first-run', '--no-default-browser-check', '--lang=en-US'];
}

export function debugEndpoint(contents) {
  const [portText, route, ...rest] = contents.trim().split(/\r?\n/);
  const port = Number(portText);
  if (!/^\d+$/.test(portText) || !Number.isInteger(port) || port < 1024 || port > 65535 ||
      !/^\/devtools\/browser\/[a-f0-9-]{36}$/i.test(route || '') || rest.length) {
    throw new Error('Invalid room browser connection file.');
  }
  // Never accept a host, URL, or redirect from the connection file.
  return `ws://127.0.0.1:${port}${route}`;
}

export class LocalBrowserConnection {
  constructor(socket, onClose = () => {}) {
    this.socket = socket; this.onClose = onClose; this.pending = new Map(); this.id = 0;
    socket.addEventListener('message', event => {
      let value; try { value = JSON.parse(event.data); } catch { return; }
      const request = this.pending.get(value.id);
      if (!request) return;
      clearTimeout(request.timeout); this.pending.delete(value.id);
      value.error ? request.reject(new Error(value.error.message)) : request.resolve(value.result);
    });
    const closed = () => {
      for (const request of this.pending.values()) { clearTimeout(request.timeout); request.reject(new Error('Room Chrome connection closed.')); }
      this.pending.clear(); this.onClose(this);
    };
    socket.addEventListener('close', closed, {once: true});
    socket.addEventListener('error', () => socket.close());
  }
  get running() { return this.socket.readyState === 1; }
  send(method, params = {}, sessionId) {
    return new Promise((resolve, reject) => {
      if (!this.running) return reject(new Error('Room Chrome is not connected.'));
      const id = ++this.id;
      const timeout = setTimeout(() => { this.pending.delete(id); reject(new Error(`Chrome did not respond to ${method}.`)); }, 12_000);
      this.pending.set(id, {resolve, reject, timeout});
      try { this.socket.send(JSON.stringify({id, method, params, ...(sessionId ? {sessionId} : {})})); }
      catch (error) { clearTimeout(timeout); this.pending.delete(id); reject(error); }
    });
  }
  async stop() {
    if (!this.running) return;
    // The close event, not a successful command response, proves this instance stopped.
    const closed = new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.socket.removeEventListener('close', done); reject(new Error('The room browser has not closed. Close its window and retry.')); }, 15_000);
      const done = () => { clearTimeout(timer); resolve(); };
      this.socket.addEventListener('close', done, {once: true});
    });
    this.send('Browser.close').catch(() => {});
    await closed;
  }
}

async function connect(endpoint, onClose) {
  const socket = new WebSocket(endpoint);
  const connection = new LocalBrowserConnection(socket, onClose);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.close(); reject(new Error('Room browser connection timed out.')); }, 2000);
    socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, {once: true});
    socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('Room browser is not ready.')); }, {once: true});
  });
  return connection;
}

export async function startNativeChrome({executable, profile, profileDirectory, onClose}) {
  await fs.mkdir(profile, {recursive: true, mode: 0o700});
  const endpointFile = path.join(profile, 'DevToolsActivePort');
  const readEndpoint = async () => {
    const stat = await fs.lstat(endpointFile);
    if (!stat.isFile() || stat.uid !== process.getuid() || stat.size > 512) throw new Error('Unsafe room browser connection file.');
    return debugEndpoint(await fs.readFile(endpointFile, 'utf8'));
  };
  // Recover only a browser advertising itself inside the private room profile.
  // Close an orphan first so an old call cannot keep transmitting after a crash.
  let orphan;
  try { orphan = await connect(await readEndpoint(), onClose); } catch {}
  if (orphan) await orphan.stop();
  await fs.rm(endpointFile, {force: true});
  // Launch Services gives Chrome its normal macOS application/permission identity.
  // No permission overrides, fake devices, external debugging hosts, or normal profile.
  await run('/usr/bin/open', nativeChromeArguments(executable, profile, profileDirectory), {timeout: 15_000});
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try { return await connect(await readEndpoint(), onClose); } catch {}
    await delay(250);
  }
  throw new Error('Room Chrome did not connect. Close any browser using the room profile and retry.');
}
