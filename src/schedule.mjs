export const FRESH_MS = 90_000;
export const LATE_MS = 5 * 60_000;

export function meetUrl(value) {
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:' || u.hostname !== 'meet.google.com' || u.port || u.username || u.password) return null;
    if (!/^\/[a-z]{3}-[a-z]{4}-[a-z]{3}\/?$/.test(u.pathname)) return null;
    return `https://meet.google.com${u.pathname.replace(/\/$/, '')}`;
  } catch { return null; }
}

export function normalizeEvents(items, email) {
  const result = [];
  if (!email) return result;
  for (const e of items) {
    if (!e.id || e.status === 'cancelled' || !e.start?.dateTime || !e.end?.dateTime) continue;
    const invite = e.attendees?.find(a => a.email?.toLowerCase() === email.toLowerCase());
    if (!invite || invite.responseStatus === 'declined') continue;
    const start = Date.parse(e.start.dateTime), end = Date.parse(e.end.dateTime);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    const links = [e.hangoutLink, ...(e.conferenceData?.entryPoints || []).filter(p => p.entryPointType === 'video').map(p => p.uri)];
    const url = links.map(meetUrl).find(Boolean);
    if (!url) continue;
    result.push({id: `${e.id}:${start}`, eventId: e.id, title: (e.summary || 'Meeting').slice(0, 240), start, end, url, organizer: e.organizer?.email || ''});
  }
  return result.sort((a,b) => a.start - b.start || a.id.localeCompare(b.id));
}

export function decide({now, events, lastSync, paused, active, history = {}}) {
  const fresh = lastSync > 0 && now - lastSync <= FRESH_MS;
  if (active) {
    if (active.source === 'agent') {
      if (now >= active.end) return {type: 'finish', reason: 'Agent-requested call duration reached'};
      const scheduled = decide({now, events, lastSync, paused, active: null, history});
      return scheduled.type === 'start' ? {type: 'finish', reason: 'A scheduled meeting is starting. Leaving the agent-requested call.'} : {type: 'hold'};
    }
    if (active.source === 'drop-in') {
      const scheduled = decide({now, events, lastSync, paused, active: null, history});
      return scheduled.type === 'start' ? {type: 'finish', reason: 'A scheduled meeting is starting. Leaving the drop-in room.'} : {type: 'hold'};
    }
    if (now >= active.end) return {type: 'finish', reason: 'Scheduled end reached'};
    if (fresh && !events.some(e => e.id === active.id && e.url === active.url)) return {type: 'finish', reason: 'Invitation cancelled, declined, or changed'};
    return {type: 'hold'};
  }
  if (paused || !fresh) return {type: 'idle'};
  const event = events.find(e => {
    const h = history[e.id];
    if (e.start > now || e.end + (h?.extension || 0) <= now || h?.done || (h?.attempts || 0) >= 3) return false;
    if (h?.retryAfter > now) return false;
    return now - e.start <= LATE_MS || h?.wasActive;
  });
  return event ? {type: 'start', event} : {type: 'idle'};
}

export function safeDashboard(value, fallback) {
  if (!value) return fallback;
  const u = new URL(value);
  if (u.username || u.password || !['http:', 'https:'].includes(u.protocol)) throw new Error('Use an HTTP or HTTPS dashboard address without credentials.');
  if (u.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)) throw new Error('Remote dashboards must use HTTPS.');
  if (u.hostname === 'meet.google.com') throw new Error('Use a dashboard address here, not a meeting link.');
  return u.href;
}

export function manualJoinEvent({id, now, events, lastSync, active, verified}) {
  if (active) throw new Error('Leave the current meeting before joining another.');
  if (!verified) throw new Error('Verify the room Chrome account before joining.');
  if (!lastSync || now - lastSync > FRESH_MS) throw new Error('Refresh the Calendar successfully before retrying.');
  const event = events.find(e => e.id === id && e.start <= now && e.end > now);
  if (!event) throw new Error('This invitation is no longer eligible or is outside its scheduled time.');
  return event;
}
