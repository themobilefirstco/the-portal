import {meetUrl} from './schedule.mjs';

export const SETUP_DEFAULTS = Object.freeze({brandedUrl: '', devicesConfirmed: false, visitConfirmed: false, linkConfirmed: false, completed: false});
export function brandedUrl(value) {
  if (typeof value !== 'string' || value.length > 2000) throw new Error('Enter your HTTPS room address.');
  if (!value.trim()) return '';
  let u; try { u = new URL(value.trim()); } catch { throw new Error('Use a full address, such as https://meet.example.com/miami.'); }
  if (u.protocol !== 'https:' || u.username || u.password || u.port || u.search || u.hash || !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(u.hostname) || u.hostname === 'meet.google.com' || u.hostname.endsWith('.localhost') || !/^\/[a-z0-9][a-z0-9-]*(?:\/[a-z0-9][a-z0-9-]*)*\/?$/i.test(u.pathname)) {
    throw new Error('Use your own HTTPS domain and a simple room path, without a query or sign-in details.');
  }
  u.pathname = u.pathname.replace(/\/$/, ''); return u.href;
}
export function updateSetup(body, settings, {connected, verified}) {
  const allowed = Object.keys(SETUP_DEFAULTS);
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(k => !allowed.includes(k))) throw new Error('Invalid setup preference.');
  const next = {...SETUP_DEFAULTS, ...settings.setup};
  if ('brandedUrl' in body) {
    const url = brandedUrl(body.brandedUrl);
    if (url && (!settings.dropInEnabled || !meetUrl(settings.dropInUrl))) throw new Error('Save and enable your dedicated Meet room first.');
    if (url !== next.brandedUrl) { next.linkConfirmed = false; next.completed = false; }
    next.brandedUrl = url;
  }
  for (const k of allowed.filter(k => k !== 'brandedUrl')) if (k in body) {
    if (typeof body[k] !== 'boolean') throw new Error('Setup confirmations must be true or false.');
    next[k] = body[k];
  }
  if (body.completed !== true && (!next.devicesConfirmed || !next.visitConfirmed || (next.brandedUrl && !next.linkConfirmed))) next.completed = false;
  if (next.devicesConfirmed && !verified) throw new Error('Verify the room browser account before confirming devices.');
  if (next.linkConfirmed && !next.brandedUrl) throw new Error('Save a branded address before confirming its redirect.');
  if (next.completed && (!connected || !verified || !next.devicesConfirmed || !next.visitConfirmed || (next.brandedUrl && !next.linkConfirmed))) throw new Error('Finish the account connections and confirm your live tests first.');
  return next;
}
