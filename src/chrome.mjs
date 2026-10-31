import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {inspectMeet, leaveMeet, inspectAccount} from './meet-page.mjs';
import {startNativeChrome} from './native-chrome.mjs';

export function findChrome() {
  return [process.env.PORTAL_CHROME, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', path.join(os.homedir(), 'Applications/Google Chrome.app/Contents/MacOS/Google Chrome')].find(p => p && fs.existsSync(p));
}

export class Chrome {
  constructor(profile, {headless = false, profileDirectory = 'Default', email = () => ''} = {}) {
    if (!/^(Default|Profile \d+)$/.test(profileDirectory)) throw new Error('Invalid room Chrome profile directory.');
    this.email = email;
    this.profileDirectory = profileDirectory;
    this.profile = profile; this.headless = headless; this.native = null; this.child = null; this.pending = new Map(); this.id = 0; this.target = null; this.session = null;
    this.displayTarget = null; this.displaySession = null; this.displayUrl = null;
  }
  get running() { return Boolean(this.native?.running || (this.child && this.child.exitCode === null && !this.child.killed)); }
  async start() {
    if (this.running) return;
    const executable = findChrome();
    if (!executable) throw new Error('Install Google Chrome in Applications first.');
    fs.mkdirSync(this.profile, {recursive: true, mode: 0o700});
    if (process.platform === 'darwin' && !this.headless) {
      const native = await startNativeChrome({executable, profile: this.profile, profileDirectory: this.profileDirectory,
        onClose: connection => { if (this.native === connection) { this.native = null; this.clearTargets(); } }});
      this.native = native;
      return;
    }
    // Headless fixtures and other platforms use a private process pipe.
    const args = [`--user-data-dir=${this.profile}`, `--profile-directory=${this.profileDirectory}`, '--remote-debugging-pipe', '--no-first-run', '--no-default-browser-check', '--lang=en-US', ...(this.headless ? ['--headless=new', '--disable-gpu'] : [])];
    this.child = spawn(executable, args, {stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe']});
    const child = this.child;
    let buffer = Buffer.alloc(0);
    child.stdio[4].on('data', chunk => {
      buffer = Buffer.concat([buffer, chunk]);
      let end;
      while ((end = buffer.indexOf(0)) >= 0) {
        const packet = buffer.subarray(0, end).toString(); buffer = buffer.subarray(end + 1);
        let value; try { value = JSON.parse(packet); } catch { continue; }
        const item = this.pending.get(value.id);
        if (item) { clearTimeout(item.timeout); this.pending.delete(value.id); value.error ? item.reject(new Error(`${item.method}: ${value.error.message}`)) : item.resolve(value.result); }
      }
    });
    const closed = () => {
      if (this.child !== child) return;
      for (const p of this.pending.values()) { clearTimeout(p.timeout); p.reject(new Error('Room Chrome closed.')); }
      this.pending.clear(); this.child = null; this.clearTargets();
    };
    child.on('error', closed); child.on('exit', closed); child.stdio[3].on('error', closed); child.stdio[4].on('error', closed);
    try { await this.send('Browser.getVersion'); }
    catch { if (this.child === child) child.kill(); throw new Error('Room Chrome could not start. Close any window using the room profile, then retry.'); }
  }
  send(method, params = {}, sessionId) {
    if (this.native) return this.native.send(method, params, sessionId);
    return new Promise((resolve, reject) => {
      if (!this.running) return reject(new Error('Room Chrome is not running.'));
      const id = ++this.id;
      const timeout = setTimeout(() => { this.pending.delete(id); reject(new Error(`Chrome did not respond to ${method}.`)); }, 12_000);
      this.pending.set(id, {resolve, reject, timeout, method});
      this.child.stdio[3].write(JSON.stringify({id, method, params, ...(sessionId ? {sessionId} : {})}) + '\0');
    });
  }
  clearTargets() {
    this.target = null; this.session = null;
    this.displayTarget = null; this.displaySession = null; this.displayUrl = null;
  }
  async attach(targetId) {
    const {sessionId} = await this.send('Target.attachToTarget', {targetId, flatten: true});
    await this.send('Page.enable', {}, sessionId);
    return sessionId;
  }
  async createTab(url) {
    try { return await this.send('Target.createTarget', {url, newWindow: false}); }
    catch (error) {
      // On macOS Chrome can remain running after its last window closes.
      // Reuse an existing window normally; create one only when Chrome says
      // there is no window in which it can create the requested tab.
      if (!/Failed to open new tab - no browser is open/i.test(error.message)) throw error;
      return this.send('Target.createTarget', {url, newWindow: true});
    }
  }
  async showDisplay(url, {front = true} = {}) {
    try { return await this.showDisplayOnce(url, {front}); }
    catch (error) {
      // A closed tab can briefly remain in getTargets while Chrome processes
      // its close request. Recover once when Chrome confirms it is gone.
      if (!/No target with given id found/i.test(error.message)) throw error;
      this.displayTarget = null; this.displaySession = null; this.displayUrl = null;
      return this.showDisplayOnce(url, {front});
    }
  }
  async showDisplayOnce(url, {front = true} = {}) {
    await this.start();
    if (this.displayTarget) {
      const {targetInfos} = await this.send('Target.getTargets');
      if (!targetInfos.some(target => target.targetId === this.displayTarget)) {
        this.displayTarget = null; this.displaySession = null; this.displayUrl = null;
      }
    }
    if (!this.displayTarget) {
      const {targetId} = await this.createTab(url);
      this.displayTarget = targetId; this.displayUrl = url;
      if (!this.headless) {
        const {windowId} = await this.send('Browser.getWindowForTarget', {targetId});
        await this.send('Browser.setWindowBounds', {windowId, bounds: {windowState: 'maximized'}}).catch(() => {});
      }
    }
    if (!this.displaySession) this.displaySession = await this.attach(this.displayTarget);
    // Preserve dashboard navigation, widgets and unsaved state between calls.
    // Only an explicit dashboard URL change should navigate this tab again.
    if (this.displayUrl !== url) {
      await this.send('Page.navigate', {url}, this.displaySession);
      this.displayUrl = url;
    }
    if (front) await this.send('Target.activateTarget', {targetId: this.displayTarget});
  }
  async open(url, {front = true} = {}) {
    await this.start();
    if (this.target) await this.leave();
    if (this.displayTarget) await this.send('Target.activateTarget', {targetId: this.displayTarget}).catch(() => {});
    // A call always gets a fresh tab. It never navigates the dashboard tab.
    const {targetId} = await this.createTab(url);
    this.target = targetId;
    this.session = await this.attach(targetId);
    if (front) await this.send('Target.activateTarget', {targetId});
  }
  async signIn() {
    // Verify the very same target used for scheduled calls, not a separate sign-in window.
    await this.open(`https://meet.google.com/?hl=en&authuser=${encodeURIComponent(this.email())}`);
  }
  async verifyAccount() {
    if (!this.running || !this.session) return false;
    const result = await this.send('Runtime.evaluate', {expression: `location.origin === 'https://meet.google.com' && (${inspectAccount.toString()})(${JSON.stringify(this.email())})`, returnByValue: true}, this.session);
    return result.result.value === true;
  }
  async inspect(act = true, allowMissingDevices = false, {ensureInitialMedia = false, mediaAttempts = {}} = {}) {
    if (!this.session) throw new Error('The meeting tab is not open.');
    const result = await this.send('Runtime.evaluate', {expression: `location.origin === 'https://meet.google.com' ? (${inspectMeet.toString()})({...${JSON.stringify({email: this.email(), act, allowMissingDevices, ensureInitialMedia, mediaAttempts})}, verified: (${inspectAccount.toString()})(${JSON.stringify(this.email())})}) : ({state:'account-required',message:'Finish signing in to the room Google account.'})`, returnByValue: true}, this.session);
    if (result.exceptionDetails) throw new Error('Google Meet page could not be checked.');
    return result.result.value || {state: 'loading'};
  }
  async leave() {
    if (!this.target) return;
    if (this.session) await this.send('Runtime.evaluate', {expression: `location.origin === 'https://meet.google.com' && (${leaveMeet.toString()})()`, returnByValue: true}, this.session).catch(() => {});
    // Do not report departure if Chrome refused to close the owned meeting tab.
    let closed = false;
    try { closed = (await this.send('Target.closeTarget', {targetId: this.target})).success === true; } catch {}
    if (!closed) {
      const {targetInfos} = await this.send('Target.getTargets');
      closed = !targetInfos.some(target => target.targetId === this.target);
    }
    if (!closed) throw new Error('Chrome could not close the meeting tab. The controller will retry leaving.');
    this.target = null; this.session = null;
  }
  async stop() {
    if (!this.running) return;
    if (this.native) { await this.native.stop(); return; }
    const child = this.child;
    // Wait for process/pipe closure before callers remove the temporary profile.
    // Sending Browser.close or SIGTERM only requests shutdown.
    let timer;
    const stopped = new Promise(resolve => {
      const done = () => { clearTimeout(timer); resolve(true); };
      child.once('close', done);
      timer = setTimeout(() => { child.removeListener('close', done); resolve(false); }, 15_000);
    });
    await this.send('Browser.close').catch(() => {});
    if (child.exitCode === null) child.kill('SIGTERM');
    if (!await stopped) throw new Error('Room Chrome did not finish closing.');
  }
}
