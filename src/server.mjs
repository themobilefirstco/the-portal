import http from 'node:http';
import {readJsonObject} from './http-body.mjs';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {Store} from './store.mjs';
import {GoogleCalendar} from './google.mjs';
import {Chrome, findChrome} from './chrome.mjs';
import {normalizeEvents, decide, safeDashboard, manualJoinEvent, meetUrl} from './schedule.mjs';
import {trackAttendance, DEFAULT_ALONE_LEAVE_SECONDS, ALONE_LEAVE_OPTIONS} from './attendance.mjs';
import {readDropInRoom, dropInEvent, retryDropInEvent, dropInParticipantCount, DROP_IN_LEAVE_SECONDS} from './drop-in.mjs';
import {checkInitialMedia, trackCaptureStartup} from './media-startup.mjs';
import {AgentError, AgentRequests, agentStatus, createAgentServer, roomHealth} from './agent-api.mjs';

import {DEFAULTS, DATA_DIR, VERSION, roomConfig, portNumber} from './config.mjs';
import {KeychainStore, MemorySecrets} from './secrets.mjs';
import {SnapshotPoller} from './poller.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const port = portNumber(process.env.PORTAL_PORT, 4280);
const agentPort = portNumber(process.env.PORTAL_AGENT_PORT, port + 1);
if (port === agentPort) throw new Error('The controller and agent ports must differ.');
const origin = `http://127.0.0.1:${port}`;
const dataDir = DATA_DIR;
const testMode = process.env.PORTAL_TEST_MODE === '1' && process.env.PORTAL_NO_BROWSER === '1';
if (process.env.PORTAL_TEST_MODE && !testMode) throw new Error('Test mode requires PORTAL_NO_BROWSER=1.');
const secrets = testMode ? new MemorySecrets() : new KeychainStore(dataDir);
const store = new Store(dataDir);
const saved = store.read('settings', {});
const settings = {...DEFAULTS, ...saved};
const controlStore = testMode ? store : secrets;
const secret = controlStore.read('control-key') || crypto.randomBytes(32).toString('base64url');
controlStore.write('control-key', secret);
const google = new GoogleCalendar(store, fetch, {secrets, settings: () => settings});
const agentRequests = new AgentRequests(store);
let agentConfig = secrets.read('agent-access', {enabled: false, token: null});
const startedAt = Date.now(); let lastTickAt = 0;
const chrome = new Chrome(path.join(dataDir, 'Chrome'), {profileDirectory: settings.chromeProfile || 'Default', email: () => settings.roomEmail});
let history = store.read('history', {}), active = null, events = [], lastSync = 0, syncError = '', browserError = '', message = 'Connect the room Calendar to begin.', tickBusy = false, nextBrowserAttempt = 0, stopping = false;
const activity = store.read('activity', []).slice(0, 200);
const note = text => { message = text; activity.unshift({at: Date.now(), text}); activity.splice(200); store.write('activity', activity); };
const persist = () => store.write('settings', settings);
let dropInSnapshot = null, dropInBusy = false, dropInNextCheck = 0, dropInFailures = 0, dropInGeneration = 0;
async function refreshDropIn() {
  if (stopping || dropInBusy || !settings.dropInEnabled || settings.paused || !google.meetConnected || Date.now() < dropInNextCheck) return;
  dropInBusy = true;
  const generation = dropInGeneration, checkedAt = Date.now();
  try {
    const result = await readDropInRoom({google, url: settings.dropInUrl, spaceName: settings.dropInSpace});
    if (generation !== dropInGeneration) return;
    dropInSnapshot = {...result, checkedAt, error: ''};
    dropInFailures = 0; dropInNextCheck = Date.now() + 5000;
  } catch (error) {
    if (generation !== dropInGeneration) return;
    dropInSnapshot = {...dropInSnapshot, error: error.message};
    dropInFailures++;
    dropInNextCheck = Date.now() + Math.min(60_000, 5000 * 2 ** Math.min(dropInFailures, 4));
  } finally { dropInBusy = false; }
}
function chime() {
  if (process.env.PORTAL_NO_BROWSER) return;
  const sound = spawn('/usr/bin/afplay', ['/System/Library/Sounds/Glass.aiff'], {stdio: 'ignore'});
  sound.on('error', () => {});
}
const saveHistory = () => {
  const cutoff = Date.now() - 7*86400_000;
  for (const [id, h] of Object.entries(history)) if ((h.updated || 0) < cutoff) delete history[id];
  store.write('history', history);
};
const home = () => safeDashboard(settings.dashboard, `${origin}/display`);
// A recurring event can keep the dedicated room link valid without scheduling room joins.
const scheduledEvents = () => events.filter(event => event.url !== settings.dropInUrl);
let controlQueue = Promise.resolve();
function exclusive(fn) {
  const next = controlQueue.then(fn);
  controlQueue = next.catch(() => {});
  return next;
}

const calendarPoller = new SnapshotPoller({
  read: async () => normalizeEvents(await google.events(), settings.roomEmail),
  publish: (snapshot, at) => { events = snapshot; lastSync = at; syncError = ''; },
  failed: error => { syncError = error.message; },
});
const sync = () => google.connected ? calendarPoller.refresh({force: true}) : Promise.resolve();
function pollCalendar() { if (!stopping && google.connected) void calendarPoller.refresh(); }

async function finish(reason, done = true) {
  if (!active) return;
  const previous = active;
  active.phase = 'leaving';
  active.finishReason = reason;
  active.finishDone = done;
  try { await chrome.leave(); }
  catch (error) { browserError = error.message; message = error.message; return; }
  active = null;
  history[previous.id] = {...history[previous.id], done, updated: Date.now()}; saveHistory();
  browserError = '';
  note(reason);
  await chrome.showDisplay(home()).catch(error => { browserError = error.message; });
}

async function start(event, {allowMissingDevices = false} = {}) {
  const h = history[event.id] || {};
  history[event.id] = {...h, attempts: (h.attempts || 0) + 1, updated: Date.now()}; saveHistory();
  active = {...event, end: event.source === 'drop-in' ? null : event.end + (h.extension || 0), extension: h.extension || 0, phase: 'opening', opened: Date.now(), wasInCall: false, allowMissingDevices, ...(event.source === 'drop-in' ? {attendance: {sawOthers: true}} : {})};
  if (event.source === 'drop-in') chime();
  note(event.source === 'drop-in' ? 'Someone joined the room. Opening the call.' : event.source === 'agent' ? `Agent requested ${event.title}. Opening the call.` : `Opening ${event.title}.`);
  try {
    await chrome.showDisplay(home(), {front: false});
    await chrome.open(`${event.url}?authuser=${encodeURIComponent(settings.roomEmail)}&hl=en`);
    if (active?.id === event.id) active.phase = 'loading';
    browserError = '';
  } catch (error) {
    active = null; browserError = error.message;
    history[event.id] = {...history[event.id], retryAfter: Date.now() + 60_000}; saveHistory();
    note(`Could not open the meeting: ${error.message}. ${history[event.id].attempts < 3 ? 'A bounded retry is scheduled.' : 'Automatic retries stopped. Repair the browser, then retry from room controls.'}`);
  }
}

async function tick() {
  if (tickBusy || stopping) return;
  tickBusy = true;
  try {
    await exclusive(async () => {
    if (active?.finishReason) { await finish(active.finishReason, active.finishDone); return; }

    // Current calendar edits update the deadline; a manual extension remains local.
    if (active && lastSync > 0 && Date.now() - lastSync <= 90_000) {
      const updated = events.find(e => e.id === active.id);
      if (updated) active.end = updated.end + (active.extension || 0);
    }
    const action = decide({now: Date.now(), events: scheduledEvents(), lastSync, syncError, paused: settings.paused || !settings.browserVerified, active, history});
    if (action.type === 'finish') { await finish(action.reason, active?.source !== 'drop-in'); return; }
    if (action.type === 'start') { await start(action.event); return; }
    if (active) {
      if (active.source === 'drop-in' && Date.now() - active.start >= settings.dropInMaxMinutes * 60_000) {
        await finish('Drop-in maximum duration reached. This conference will not be rejoined.'); return;
      }
      if (!chrome.running) {
        const interrupted = active;
        active = null;
        history[interrupted.id] = {...history[interrupted.id], wasActive: interrupted.wasInCall || history[interrupted.id]?.wasActive, retryAfter: Date.now() + 30_000, updated: Date.now()}; saveHistory();
        note('Room Chrome closed. Waiting briefly before reconnecting.'); return;
      }
      let result;
      try { result = await chrome.inspect(true, active.allowMissingDevices, {ensureInitialMedia: !active.mediaStartup?.verified, mediaAttempts: active.mediaStartup?.attempts}); }
      catch (error) {
        // A missing target after a call was joined is treated as leaving, not permission to rejoin.
        if (active.wasInCall) { await finish('Meeting tab closed. This invitation will not be rejoined.'); return; }
        result = {state: 'loading', message: error.message};
      }
      active.phase = result.state;
      if (result.state === 'joining' && !active.automaticJoinRequestedAt) {
        active.automaticJoinRequestedAt = Date.now();
        note('Controller pressed the Google Meet join button automatically. Waiting to confirm entry.');
      }
      if (result.message) message = result.message;
      if (result.state === 'account-required') { settings.browserVerified = false; persist(); }
      active.captureStartup = trackCaptureStartup(active.captureStartup, {now: Date.now(), state: result.state, wasInCall: active.wasInCall});
      if (active.captureStartup.restart) {
        // Recover the call tab without closing the dashboard or other tabs.
        note('The room camera has not started. Reopening the meeting tab once before joining.');
        await chrome.leave();
        await chrome.open(`${active.url}?authuser=${encodeURIComponent(settings.roomEmail)}&hl=en`);
        active.phase = 'loading'; active.opened = Date.now();
        return;
      }
      if (result.state === 'in-call') {
        if (!active.wasInCall) {
          active.wasInCall = true;
          history[active.id] = {...history[active.id], wasActive: true, updated: Date.now()}; saveHistory();
          note(`Joined ${active.title}. ${active.allowMissingDevices ? 'This test uses camera and microphone off.' : 'Checking camera and microphone after entry.'}`);
        }
        const alreadyVerified = active.mediaStartup?.verified;
        active.mediaObserved = result.media;
        active.mediaStartup = checkInitialMedia(active.mediaStartup, {now: Date.now(), media: result.media, actions: result.mediaActions, allowMissingDevices: active.allowMissingDevices});
        if (active.mediaStartup.failed) {
          const failure = 'Camera and microphone could not both be enabled after joining. Left the call; check device permissions and retry.';
          await finish(failure); if (!active) browserError = failure; return;
        }
        if (!alreadyVerified && active.mediaStartup.verified && !active.allowMissingDevices) note(`In meeting: ${active.title}. Camera and microphone controls confirmed on after entry.`);
        const wasCountingDown = active.attendance?.deadline != null;
        const roomCount = active.source === 'drop-in' ? dropInParticipantCount({now: Date.now(), snapshot: dropInSnapshot, conference: active.conference}) : null;
        const departureSeconds = active.source === 'drop-in' ? DROP_IN_LEAVE_SECONDS : settings.aloneLeaveSeconds;
        active.attendance = trackAttendance(active.attendance, {now: Date.now(), count: active.source === 'drop-in' ? roomCount : result.participantCount, delayMs: departureSeconds * 1000});
        if (active.attendance.leave) {
          await finish(`Everyone else left. Closed the meeting tab after ${departureSeconds} seconds and returned to the dashboard.`, active.source !== 'drop-in');
          return;
        }
        if (active.attendance.deadline != null) message = `Everyone else left. Leaving in ${Math.max(0, Math.ceil((active.attendance.deadline - Date.now()) / 1000))} seconds unless someone returns.`;
        else if (wasCountingDown) message = active.attendance.count > 1 ? 'Someone returned. Automatic departure cancelled.' : 'Participant count unavailable. Waiting for a reliable count before leaving.';
      } else if (result.state === 'access-denied') {
        await finish(result.message);
        browserError = result.message;
      } else if (result.state === 'ended' || (active.wasInCall && ['loading', 'account-required'].includes(result.state))) {
        await finish(active.wasInCall ? 'Call ended. Returned to the room display.' : 'Google Meet closed this attempt before the room joined. Check access and retry.');
      } else if (Date.now() - active.opened > 5*60_000) {
        const failure = result.state === 'waiting' ? 'Host admission was not granted within five minutes.' : `Could not enter the meeting within five minutes (${result.state}). Check sign-in and devices.`;
        await finish(failure); if (!active) browserError = failure;
      }
      if (active && result.state !== 'in-call') active.attendance = trackAttendance(active.attendance, {now: Date.now(), count: null, inCall: false});
    } else {
      const visitor = dropInEvent({now: Date.now(), snapshot: dropInSnapshot, enabled: settings.dropInEnabled, paused: settings.paused, verified: settings.browserVerified, calendarFresh: !syncError && lastSync > 0 && Date.now() - lastSync <= 90_000, active, history});
      if (visitor) { await start(visitor); return; }
      if ((!chrome.running || !chrome.displayTarget) && Date.now() >= nextBrowserAttempt && !process.env.PORTAL_NO_BROWSER) {
      nextBrowserAttempt = Date.now() + 60_000;
      await chrome.showDisplay(home()).then(() => { browserError = ''; }).catch(error => { browserError = error.message; });
      }
    }
    });
  } catch (error) { note(`Controller needs attention: ${error.message}`); }
  finally { lastTickAt = Date.now(); agentRequests.observe(active, message); tickBusy = false; }
}

const publicState = () => ({name: settings.roomName, timeZone: settings.timeZone, connected: health().healthy, paused: settings.paused, attention: !health().healthy, active: Boolean(active)});
const status = () => ({name: settings.roomName, email: settings.roomEmail, settings, agent: {enabled: agentConfig.enabled, hasToken: Boolean(agentConfig.token), port: agentPort}, camera: 'on', microphone: 'on', calendar: {hasClient: Boolean(google.client), connected: google.connected, lastSync, error: syncError}, browser: {installed: Boolean(findChrome()), running: chrome.running, verified: settings.browserVerified, error: browserError, dashboardOpen: Boolean(chrome.displayTarget), meetingTabOpen: Boolean(chrome.target)}, dropIn: {connected: google.meetConnected && Boolean(google.tokens?.sub), ...dropInSnapshot, leaveAfterSeconds: DROP_IN_LEAVE_SECONDS}, active, events: scheduledEvents().filter(e => e.end > Date.now()), activity, message, fresh: !syncError && lastSync > 0 && Date.now()-lastSync <= 90_000});
const health = () => roomHealth(status(), {lastTickAt, startedAt});
const agentServer = createAgentServer({
  getConfig: () => agentConfig, getStatus: () => agentStatus(status(), health()), requests: agentRequests, exclusive,
  join: async body => {
    if (settings.paused) throw new AgentError(409, 'Joining is paused in local room controls.');
    if (active) throw new AgentError(409, 'A call is already active. Leave its exact callId first.');
    if (!settings.browserVerified) throw new AgentError(409, 'Room browser sign-in must be verified locally.');
    if (decide({now: Date.now(), events: scheduledEvents(), lastSync, syncError, paused: false, active: null, history}).type === 'start') throw new AgentError(409, 'A scheduled meeting is due and has priority.');
    const now = Date.now(), id = `agent:${crypto.randomUUID()}`;
    await start({id, source: 'agent', title: body.title, url: body.url, start: now, end: now + body.durationMinutes * 60_000});
    if (active?.id !== id) throw new AgentError(503, browserError || 'The room browser could not open the meeting.');
    return {callId: id};
  },
  leave: async ({callId}) => {
    if (!active || active.id !== callId) throw new AgentError(409, 'The active call changed. Read status and use its exact callId.');
    await finish('Left at the agent’s request. This call will not be rejoined.');
    if (active) throw new AgentError(503, 'Departure is still pending. Read status before retrying.');
    return {callId};
  },
});

const sameKey = value => {
  const a = Buffer.from(value || ''), b = Buffer.from(secret);
  return a.length === b.length && crypto.timingSafeEqual(a,b);
};
function reply(res, code, body, type = 'application/json') {
  res.writeHead(code, {'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"});
  res.end(type === 'application/json' ? JSON.stringify(body) : body);
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.headers.host !== `127.0.0.1:${port}`) return reply(res, 403, {error: 'Open the controller using 127.0.0.1.'});
    const u = new URL(req.url, origin);
    if (req.headers.origin && req.headers.origin !== origin) return reply(res, 403, {error: 'Cross-site request blocked.'});
    if (u.pathname === '/health' && req.method === 'GET') return reply(res, 200, {app: 'the-portal', version: VERSION, controllerLastTick: lastTickAt || null});
    if (u.pathname === '/room-status' && req.method === 'GET') return reply(res, 200, publicState());
    if (u.pathname === '/oauth/callback' && req.method === 'GET') {
      try {
        if (u.searchParams.get('error')) throw new Error('Google access was not granted. Return to the controller and try again.');
        await exclusive(async () => {
          if (active) throw new Error('Leave the meeting and reconnect Google.');
          await google.complete(u.searchParams.get('code'), u.searchParams.get('state'));
          void sync(); note(google.meetConnected ? 'Calendar and Google Meet monitoring connected to the Portal room.' : 'Calendar connected to the Portal room.');
        });
        return reply(res, 200, '<!doctype html><html><meta charset="utf-8"><title>Google connected</title><link rel="stylesheet" href="/style.css"><body class="callback"><h1>Google connected.</h1><p>You can close this tab and return to the Portal controller.</p></body></html>', 'text/html');
      } catch (error) {
        note(error.message);
        return reply(res, 400, '<!doctype html><html><meta charset="utf-8"><title>Connection needs attention</title><link rel="stylesheet" href="/style.css"><body class="callback"><h1>Calendar connection needs attention.</h1><p>Return to the Portal controller to see the message and reconnect.</p></body></html>', 'text/html');
      }
    }
    if (u.pathname.startsWith('/api/')) {
      if (!sameKey(req.headers['x-room-token'])) return reply(res, 401, {error: 'Open the controller using Open Portal.command.'});
      if (u.pathname === '/api/status' && req.method === 'GET') return reply(res, 200, {...status(), health: health()});
      if (req.method !== 'POST' || !/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) return reply(res, 405, {error: 'Use a JSON POST.'});
      const body = await readJsonObject(req);
      return await exclusive(async () => {
      switch (u.pathname) {
        case '/api/agent-access':
          if (typeof body.enabled !== 'boolean') throw new Error('Choose whether agent access is enabled.');
          agentConfig.enabled = body.enabled;
          if (body.enabled && !agentConfig.token) agentConfig.token = crypto.randomBytes(32).toString('base64url');
          secrets.write('agent-access', agentConfig);
          note(body.enabled ? 'Agent room controls enabled locally. Private remote networking must be configured separately.' : 'Agent room controls disabled.');
          break;
        case '/api/agent-token':
          if (!agentConfig.enabled) throw new Error('Enable agent access first.');
          if (body.rotate === true) { agentConfig.token = crypto.randomBytes(32).toString('base64url'); secrets.write('agent-access', agentConfig); note('Agent access token rotated. Previous token revoked.'); }
          return reply(res, 200, {token: agentConfig.token});
        case '/api/room': {
          if (active) throw new Error('Leave the current call before changing the room.');
          const config = roomConfig(body);
          if (config.roomEmail !== settings.roomEmail) {
            if (google.connected) throw new Error('Disconnect Google before changing the room account.');
            await chrome.stop();
            settings.browserVerified = false; settings.paused = true; google.pending = null;
            settings.dropInEnabled = false; settings.dropInUrl = ''; settings.dropInSpace = '';
            events = []; lastSync = 0; syncError = ''; calendarPoller.invalidate();
            dropInGeneration++; dropInSnapshot = null; dropInNextCheck = 0; dropInFailures = 0;
          }
          Object.assign(settings, config); persist(); note('Room saved. Connect this Google account next.'); break;
        }
        case '/api/disconnect':
          if (active) throw new Error('Leave the current call before disconnecting Google.');
          calendarPoller.invalidate();
          await google.disconnect(); await chrome.stop();
          events = []; lastSync = 0; syncError = ''; settings.paused = true;
          settings.browserVerified = false; settings.dropInEnabled = false;
          dropInGeneration++; dropInSnapshot = null; persist();
          note('Google API access revoked. The room is paused. Sign out of the separate room Chrome profile to remove its browser session.'); break;
        case '/api/client':
          if (active) throw new Error('Leave the active meeting before changing the Calendar connection.');
          if (testMode) throw new Error('Google authorization is unavailable in synthetic test mode.');
          if (google.connected) throw new Error('Disconnect Google before replacing the OAuth client.');
          calendarPoller.invalidate(); google.saveClient(body); events = []; lastSync = 0; note('Google client imported. Connect Calendar next.'); break;
        case '/api/connect': if (active) throw new Error('Leave the meeting before reconnecting Google.'); if (testMode) throw new Error('Google authorization is unavailable in synthetic test mode.'); return reply(res, 200, {url: google.begin(`${origin}/oauth/callback`, {meet: body.meet === true})});
        case '/api/drop-in': {
          if (active) throw new Error('Leave the call before changing the drop-in room.');
          if (typeof body.enabled !== 'boolean' || typeof body.url !== 'string') throw new Error('Choose a room link and whether drop-ins are enabled.');
          const url = body.url ? meetUrl(body.url) : '';
          if (body.url && !url) throw new Error('Enter a Google Meet meeting link.');
          if (body.enabled && (!url || body.accessConfirmed !== true)) throw new Error('Configure the Meet access rules and confirm them before enabling drop-ins.');
          let verified = null;
          if (body.enabled) verified = await readDropInRoom({google, url, spaceName: url === settings.dropInUrl ? settings.dropInSpace : ''});
          const sameRoom = url === settings.dropInUrl;
          settings.dropInUrl = url; settings.dropInEnabled = body.enabled;
          settings.dropInSpace = verified?.spaceName || (sameRoom ? settings.dropInSpace : '');
          persist(); dropInGeneration++; dropInSnapshot = null; dropInNextCheck = 0; dropInFailures = 0;
          note(body.enabled ? 'Drop-in monitoring enabled. Scheduled meetings take priority.' : 'Drop-in monitoring is off.');
          break;
        }
        case '/api/sync': void sync(); break;
        case '/api/drop-in-retry': {
          if (active) throw new Error('A meeting is already active.');
          if (!settings.dropInEnabled || settings.paused || !settings.browserVerified) throw new Error('Enable automatic drop-in joining and verify the room browser before retrying.');
          if (calendarPoller.busy) throw new Error('Calendar is refreshing. Retry shortly.');
          if (decide({now: Date.now(), events: scheduledEvents(), lastSync, syncError, paused: false, active, history}).type === 'start') throw new Error('A scheduled meeting is due and takes priority.');
          const checkedAt = Date.now();
          const snapshot = await readDropInRoom({google, url: settings.dropInUrl, spaceName: settings.dropInSpace});
          const event = retryDropInEvent({now: Date.now(), snapshot: {...snapshot, checkedAt}, enabled: settings.dropInEnabled, paused: settings.paused, verified: settings.browserVerified, calendarFresh: !syncError && lastSync > 0 && Date.now() - lastSync <= 90_000, active, history});
          history[event.id] = {...history[event.id], attempts: 0, retryAfter: 0};
          await start(event);
          break;
        }
        case '/api/retry': {
          if ('allowMissingDevices' in body && typeof body.allowMissingDevices !== 'boolean') throw new Error('Test mode must be true or false.');
          if (calendarPoller.busy) throw new Error('Calendar is refreshing. Retry shortly.');
          if (syncError) throw new Error(syncError);
          const event = manualJoinEvent({id: body.id, now: Date.now(), events: scheduledEvents(), lastSync, active, verified: settings.browserVerified});
          history[event.id] = {...history[event.id], done: false, retryAfter: 0, attempts: 0};
          await start(event, {allowMissingDevices: body.allowMissingDevices === true});
          break;
        }
        case '/api/browser':
          if (active) throw new Error('A meeting is active. Use Leave meeting before opening the room display.');
          await chrome.showDisplay(home()); browserError = ''; break;
        case '/api/signin':
          if (active) throw new Error('Leave the active meeting before changing the browser login.');
          await chrome.signIn(); break;
        case '/api/verify':
          settings.browserVerified = await chrome.verifyAccount(); persist();
          note(settings.browserVerified ? 'Room browser account verified.' : 'Account not verified yet. Finish signing in in the room Chrome window, return to Meet, then check again.'); break;
        case '/api/settings':
          if ('paused' in body && typeof body.paused !== 'boolean') throw new Error('Paused must be true or false.');
          if ('aloneLeaveSeconds' in body && !ALONE_LEAVE_OPTIONS.includes(body.aloneLeaveSeconds)) throw new Error('Choose 30, 60, or 120 seconds, or turn automatic departure off.');
          if ('dashboard' in body) { if (typeof body.dashboard !== 'string' || body.dashboard.length > 2000) throw new Error('Invalid dashboard address.'); safeDashboard(body.dashboard, `${origin}/display`); }
          if (body.paused === false && (!settings.roomEmail || !google.connected || !settings.browserVerified)) throw new Error('Save the room, connect Google, and verify room Chrome before enabling automatic joins.');
          if ('paused' in body) settings.paused = body.paused;
          if ('dashboard' in body) settings.dashboard = body.dashboard;
          if ('aloneLeaveSeconds' in body) {
            settings.aloneLeaveSeconds = body.aloneLeaveSeconds;
            if (active?.attendance) active.attendance = {...active.attendance, aloneSince: null, deadline: null};
          }
          persist();
          note('aloneLeaveSeconds' in body ? (settings.aloneLeaveSeconds ? `The room will leave ${settings.aloneLeaveSeconds} seconds after everyone else leaves, after another participant has been seen.` : 'Leaving when alone is off. The scheduled end still applies.') : settings.paused ? 'Automatic joining paused. An existing call continues until you leave or its scheduled end.' : 'Automatic joining enabled.'); break;
        case '/api/leave': await finish(active?.source === 'drop-in' ? 'Left from room controls. This drop-in conference will not be rejoined.' : 'Left from room controls. This invitation will not be rejoined.'); break;
        case '/api/extend':
          if (!active) throw new Error('There is no active meeting to extend.');
          if (active.source === 'drop-in') throw new Error('Drop-in calls have no scheduled end. They finish when visitors leave or a scheduled meeting starts.');
          active.extension = (active.extension || 0) + 15*60_000; active.end += 15*60_000;
          history[active.id] = {...history[active.id], extension: active.extension, updated: Date.now()}; saveHistory();
          note('Added 15 minutes to this call.'); break;
        default: return reply(res, 404, {error: 'Not found.'});
      }
      return reply(res, 200, {...status(), health: health()});
      });
    }
    const staticFiles = {'/': ['index.html','text/html'], '/display': ['display.html','text/html'], '/app.js': ['app.js','text/javascript'], '/display.js': ['display.js','text/javascript'], '/style.css': ['style.css','text/css']};
    if (req.method === 'GET' && staticFiles[u.pathname]) {
      const [file, type] = staticFiles[u.pathname]; return reply(res, 200, fs.readFileSync(path.join(here, '../web', file), 'utf8'), type);
    }
    reply(res, 404, {error: 'Not found.'});
  } catch (error) { reply(res, error.status || 400, {error: error.message}); }
});

server.requestTimeout = 20_000;
server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? `Port ${port} is already in use. Open the existing controller or choose another port.` : `Controller could not listen on its local port (${error.code}).`); process.exit(1); });
server.listen(port, '127.0.0.1', () => { console.log(`Portal room controller listening at ${origin}`); tick(); });
const timer = setInterval(tick, 3000);
const calendarTimer = setInterval(pollCalendar, 1000); pollCalendar();
agentServer.on('error', error => note(`Agent API could not listen (${error.code}). Automatic Calendar meetings remain available.`));
agentServer.listen(agentPort, '127.0.0.1');
const dropInTimer = setInterval(refreshDropIn, 1000);
const awake = process.env.PORTAL_NO_BROWSER ? null : spawn('/usr/bin/caffeinate', ['-d', '-i', '-w', String(process.pid)], {stdio: 'ignore'});
awake?.on('error', () => {});
async function stop() { if (stopping) return; stopping = true; clearInterval(timer); clearInterval(calendarTimer); clearInterval(dropInTimer); agentServer.close(); awake?.kill(); await chrome.stop(); server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 2000).unref(); }
process.on('SIGTERM', stop); process.on('SIGINT', stop);
