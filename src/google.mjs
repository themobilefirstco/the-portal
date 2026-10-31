import crypto from 'node:crypto';
import {MEET_SCOPE} from './drop-in.mjs';

export const SCOPE = 'openid email https://www.googleapis.com/auth/calendar.events.readonly';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const encode = b => b.toString('base64url');

export function validateClient(input) {
  const c = input?.installed;
  if (!c || typeof c.client_id !== 'string' || !c.client_id.endsWith('.apps.googleusercontent.com') || typeof c.client_secret !== 'string' || !c.client_secret) {
    throw new Error('Choose the JSON downloaded for a Google OAuth client of type Desktop app.');
  }
  return {client_id: c.client_id, client_secret: c.client_secret};
}

export class GoogleCalendar {
  constructor(store, fetcher = fetch, {secrets = store, settings = () => store.read('settings', {})} = {}) {
    this.store = store; this.secrets = secrets; this.settings = settings; this.fetch = fetcher;
    this.client = secrets.read('google-client'); this.tokens = secrets.read('google-tokens'); this.pending = null; this.generation = 0;
  }
  get email() { return this.settings().roomEmail || ''; }
  get connected() { return Boolean(this.tokens?.refresh_token && this.tokens.email === this.email); }
  get meetConnected() { return this.connected && (this.tokens.scope || '').split(/\s+/).includes(MEET_SCOPE); }
  saveClient(input) { this.generation++; this.pending = null; this.client = validateClient(input); this.secrets.write('google-client', this.client); this.tokens = null; this.secrets.write('google-tokens', null); }
  begin(redirect, {meet = false} = {}) {
    if (!this.email) throw new Error('Save the room Google email first.');
    if (!this.client) throw new Error('Import the Desktop app JSON first.');
    const verifier = encode(crypto.randomBytes(48));
    this.pending = {email: this.email, generation: this.generation, state: encode(crypto.randomBytes(32)), verifier, redirect, expires: Date.now() + 10 * 60_000};
    const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    u.search = new URLSearchParams({client_id: this.client.client_id, redirect_uri: redirect, response_type: 'code', scope: `${SCOPE}${meet || this.meetConnected ? ` ${MEET_SCOPE}` : ''}`, access_type: 'offline', prompt: 'consent', login_hint: this.email, state: this.pending.state, code_challenge: encode(crypto.createHash('sha256').update(verifier).digest()), code_challenge_method: 'S256'});
    return u.href;
  }
  async json(url, options = {}) {
    const response = await this.fetch(url, {...options, signal: AbortSignal.timeout(15_000)});
    const body = await response.json();
    if (!response.ok) {
      if (body.error === 'invalid_grant') throw new Error('Google authorization expired or was revoked. Connect Calendar again.');
      if (response.status === 403) throw new Error('Calendar access denied. Enable Google Calendar API and check its Google project and organization access policy.');
      throw new Error(`Google request failed (${response.status}). Check the connection and Google setup.`);
    }
    return body;
  }
  async token(params) {
    return this.json(TOKEN_URL, {method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'}, body: new URLSearchParams({...this.client, ...params})});
  }
  async complete(code, state) {
    const p = this.pending;
    if (!p || p.expires < Date.now() || !state || state !== p.state || !code) throw new Error('This sign-in has expired. Start Connect Calendar again.');
    this.pending = null;
    const result = await this.token({code, code_verifier: p.verifier, redirect_uri: p.redirect, grant_type: 'authorization_code'});
    const who = await this.json('https://openidconnect.googleapis.com/v1/userinfo', {headers: {Authorization: `Bearer ${result.access_token}`}});
    if (p.generation !== this.generation || p.email !== this.email || who.email?.toLowerCase() !== this.email || !who.email_verified || !who.sub) throw new Error(`Please connect ${this.email}, not another Google account.`);
    if (!result.refresh_token) throw new Error('Google did not provide ongoing access. Reconnect Calendar and grant access.');
    this.tokens = {...result, email: who.email.toLowerCase(), sub: who.sub, expires_at: Date.now() + result.expires_in * 1000};
    this.secrets.write('google-tokens', this.tokens);
  }
  async accessToken() {
    if (!this.connected) throw new Error('Connect the room Calendar to continue.');
    if (this.tokens.expires_at > Date.now() + 60_000) return this.tokens.access_token;
    if (this.refreshing) return this.refreshing;
    this.refreshing = this.refreshAccessToken();
    try { return await this.refreshing; } finally { this.refreshing = null; }
  }
  async refreshAccessToken() {
    const generation = this.generation;
    const result = await this.token({refresh_token: this.tokens.refresh_token, grant_type: 'refresh_token'});
    if (generation !== this.generation) throw new Error('Google connection changed during token refresh.');
    this.tokens = {...this.tokens, ...result, expires_at: Date.now() + result.expires_in * 1000};
    this.secrets.write('google-tokens', this.tokens);
    return this.tokens.access_token;
  }
  async disconnect() {
    this.generation++;
    const token = this.tokens?.refresh_token;
    if (token) {
      const response = await this.fetch('https://oauth2.googleapis.com/revoke', {method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'}, body: new URLSearchParams({token}), signal: AbortSignal.timeout(15_000)});
      if (!response.ok && response.status !== 400) throw new Error('Google could not revoke access. Retry when online.');
    }
    this.tokens = null; this.pending = null; this.secrets.write('google-tokens', null);
  }
  async events(now = Date.now()) {
    const access = await this.accessToken(), items = [];
    let pageToken;
    for (let page = 0; page < 20; page++) {
      const u = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
      u.search = new URLSearchParams({timeMin: new Date(now - 12*3600_000).toISOString(), timeMax: new Date(now + 48*3600_000).toISOString(), singleEvents: 'true', orderBy: 'startTime', maxResults: '250', showDeleted: 'false', ...(pageToken ? {pageToken} : {})});
      const result = await this.json(u, {headers: {Authorization: `Bearer ${access}`}});
      items.push(...(result.items || [])); pageToken = result.nextPageToken;
      if (!pageToken) return items;
    }
    throw new Error('Too many calendar events; sync was incomplete and automatic joining is waiting.');
  }
}
