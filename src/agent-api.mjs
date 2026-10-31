import http from 'node:http';
import crypto from 'node:crypto';
import {meetUrl} from './schedule.mjs';

export class AgentError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export function agentCommand(kind, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new AgentError(400, 'Send a JSON object.');
  const allowed = kind === 'join' ? ['url', 'durationMinutes', 'title'] : ['callId'];
  if (Object.keys(body).some(key => !allowed.includes(key))) throw new AgentError(400, 'Unknown command field.');
  if (kind === 'join') {
    const url = meetUrl(body.url), durationMinutes = body.durationMinutes ?? 60;
    if (!url) throw new AgentError(400, 'Use a full https://meet.google.com/abc-defg-hij link.');
    if (!Number.isInteger(durationMinutes) || durationMinutes < 5 || durationMinutes > 180) throw new AgentError(400, 'durationMinutes must be an integer from 5 to 180.');
    if (body.title !== undefined && (typeof body.title !== 'string' || !body.title.trim() || body.title.length > 120)) throw new AgentError(400, 'title must contain 1–120 characters.');
    return {url, durationMinutes, title: body.title?.trim() || 'Agent requested meeting'};
  }
  if (typeof body.callId !== 'string' || !body.callId || body.callId.length > 300) throw new AgentError(400, 'callId from the current status is required.');
  return {callId: body.callId};
}

export function roomHealth(s, {lastTickAt, startedAt, now = Date.now()}) {
  const issues = [];
  if (!lastTickAt || now - lastTickAt > 30_000) issues.push('controller_stalled');
  if (!s.calendar.connected) issues.push('calendar_disconnected');
  else if (s.calendar.error || !s.calendar.lastSync || now - s.calendar.lastSync > 90_000) issues.push('calendar_stale');
  if (!s.browser.running) issues.push('browser_closed');
  if (!s.browser.verified) issues.push('browser_signin_needed');
  if (s.browser.running && s.browser.dashboardOpen === false && !s.active) issues.push('display_closed');
  if (s.settings.dropInEnabled && (!s.dropIn?.connected || s.dropIn.error || !s.dropIn.checkedAt || now - s.dropIn.checkedAt > 15_000)) issues.push('drop_in_unavailable');
  if (s.browser.error) issues.push('browser_error');
  if (s.settings.paused) issues.push('joining_paused');
  if (s.active && ['devices-required', 'devices-starting', 'account-required', 'access-denied'].includes(s.active.phase)) issues.push(s.active.phase.replaceAll('-', '_'));
  if (s.active?.phase === 'in-call' && !s.active.mediaStartup?.verified) issues.push('media_unverified');
  return {healthy: issues.length === 0, issues, checkedAt: now, uptimeSeconds: Math.floor((now - startedAt) / 1000),
    lastControllerTick: lastTickAt || null, lastCalendarSync: s.calendar.lastSync || null,
    devices: s.active?.phase === 'in-call' ? (s.active.mediaObserved || {camera: 'unknown', microphone: 'unknown'}) : {camera: 'not_checked', microphone: 'not_checked'},
    participantCount: s.active?.attendance?.count ?? null};
}

export function agentStatus(s, health) {
  const a = s.active;
  return {room: s.name || 'The Portal', health, paused: s.settings.paused,
    active: a ? {callId: a.id, source: a.source || 'calendar', title: a.title, url: a.url, phase: a.phase,
      endsAt: a.end ? new Date(a.end).toISOString() : null, media: a.mediaObserved || null,
      mediaVerified: Boolean(a.mediaStartup?.verified), participantCount: a.attendance?.count ?? null} : null,
    message: s.message, recentActivity: s.activity.slice(0, 10)};
}

export class AgentRequests {
  constructor(store) {
    this.store = store; this.records = store.read('agent-requests', []).slice(-500);
    for (const record of this.records) if (['executing', 'accepted'].includes(record.outcome)) {
      record.outcome = 'interrupted'; record.error = 'Controller restarted. Read status before sending a new command.';
    }
    this.save();
  }
  save() { this.store.write('agent-requests', this.records); }
  get(key) { return this.records.find(record => record.requestId === key); }
  async execute(key, kind, payload, action) {
    if (!/^[a-zA-Z0-9_-]{8,128}$/.test(key || '')) throw new AgentError(400, 'Supply an Idempotency-Key of 8–128 letters, numbers, underscores or hyphens.');
    const fingerprint = crypto.createHash('sha256').update(JSON.stringify({kind, payload})).digest('hex');
    const existing = this.get(key);
    if (existing) {
      if (existing.fingerprint !== fingerprint) throw new AgentError(409, 'This Idempotency-Key was used for a different command.');
      return existing;
    }
    // Retain requests for seven days. Refuse excess commands instead of losing replay protection.
    this.records = this.records.filter(record => record.at > Date.now() - 7 * 86400_000 || ['executing', 'accepted'].includes(record.outcome));
    if (this.records.length >= 500) throw new AgentError(429, 'Command history is full. Try again after older requests expire.');
    const record = {requestId: key, kind, fingerprint, at: Date.now(), outcome: 'executing'};
    this.records.push(record); this.save();
    try { Object.assign(record, await action(payload), {outcome: kind === 'join' ? 'accepted' : 'left'}); }
    catch (error) { record.outcome = 'failed'; record.error = error.message; record.httpStatus = error.status || 409; }
    this.save(); return record;
  }
  observe(active, message) {
    let changed = false;
    for (const record of this.records) {
      if (record.kind !== 'join' || record.outcome !== 'accepted') continue;
      if (active?.id === record.callId) {
        if (active.phase === 'in-call' && active.mediaStartup?.verified) { record.outcome = 'joined'; changed = true; }
      } else { record.outcome = 'failed'; record.error = message || 'The call ended before entry was verified.'; changed = true; }
    }
    if (changed) this.save();
  }
}

const publicRequest = ({fingerprint, ...record}) => record;
const sameToken = (given, token) => {
  if (!token || typeof given !== 'string') return false;
  const a = Buffer.from(given), b = Buffer.from(`Bearer ${token}`);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};
async function bodyJSON(req) {
  if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) throw new AgentError(415, 'Use Content-Type: application/json.');
  let text = '';
  for await (const part of req) {
    text += part;
    if (Buffer.byteLength(text) > 4096) throw new AgentError(413, 'Request body exceeds 4 KB.');
  }
  try { return JSON.parse(text); } catch { throw new AgentError(400, 'Invalid JSON.'); }
}

export function createAgentServer({getConfig, getStatus, requests, exclusive, join, leave}) {
  const reply = (res, status, value) => {
    res.writeHead(status, {'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'});
    res.end(JSON.stringify(value));
  };
  let minute = 0, count = 0;
  const server = http.createServer(async (req, res) => {
    try {
      // The bearer API is for agents, not browser pages. It has no cookies or CORS exception.
      if (req.headers.origin) throw new AgentError(403, 'Browser-origin requests are not supported.');
      const config = getConfig();
      if (!config.enabled || !sameToken(req.headers.authorization, config.token)) throw new AgentError(401, 'Agent access is disabled or the access token is invalid.');
      const window = Math.floor(Date.now() / 60_000);
      if (window !== minute) { minute = window; count = 0; }
      if (++count > 120) throw new AgentError(429, 'Rate limit exceeded. Wait one minute.');
      const u = new URL(req.url, 'http://127.0.0.1');
      if (u.search) throw new AgentError(400, 'Query parameters are not supported.');
      if (req.method === 'GET' && u.pathname === '/v1/status') return reply(res, 200, getStatus());
      if (req.method === 'GET' && u.pathname === '/v1/health') {
        const health = getStatus().health; return reply(res, health.healthy ? 200 : 503, health);
      }
      if (req.method === 'GET' && /^\/v1\/requests\/[a-zA-Z0-9_-]{8,128}$/.test(u.pathname)) {
        const record = requests.get(u.pathname.split('/').pop());
        if (!record) throw new AgentError(404, 'Unknown request.');
        return reply(res, 200, publicRequest(record));
      }
      const kind = u.pathname === '/v1/join' ? 'join' : u.pathname === '/v1/leave' ? 'leave' : null;
      if (req.method !== 'POST' || !kind) throw new AgentError(404, 'Unknown endpoint.');
      const payload = agentCommand(kind, await bodyJSON(req));
      const key = req.headers['idempotency-key'];
      const record = await exclusive(async () => {
        // Revocation while a command waits in the queue must take effect before it executes.
        const current = getConfig();
        if (!current.enabled || !sameToken(req.headers.authorization, current.token)) throw new AgentError(401, 'Agent access was revoked.');
        return requests.execute(key, kind, payload, kind === 'join' ? join : leave);
      });
      return reply(res, record.outcome === 'failed' ? record.httpStatus || 409 : record.outcome === 'accepted' ? 202 : 200, publicRequest(record));
    } catch (error) { reply(res, error.status || 500, {error: error.status ? error.message : 'Room controller could not complete this request.'}); }
  });
  server.requestTimeout = 30_000; server.headersTimeout = 10_000; server.keepAliveTimeout = 5000;
  return server;
}
