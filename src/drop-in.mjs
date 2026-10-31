import {meetUrl} from './schedule.mjs';

export const MEET_SCOPE = 'https://www.googleapis.com/auth/meetings.space.readonly';
export const DROP_IN_FRESH_MS = 15_000;
export const DROP_IN_LEAVE_SECONDS = 15;
const spacePattern = /^spaces\/[A-Za-z0-9_-]{1,128}$/;
const conferencePattern = /^conferenceRecords\/[A-Za-z0-9_-]+$/;

// Read actual conference participants; opening a link or waiting for admission is not a join.
export async function readDropInRoom({google, url, spaceName = '', fetcher = fetch}) {
  const normalized = meetUrl(url);
  if (!normalized) throw new Error('Enter a Google Meet meeting link.');
  if (!google.meetConnected || !google.tokens?.sub) throw new Error('Connect Google Meet monitoring as the Portal room account first.');
  if (spaceName && !spacePattern.test(spaceName)) throw new Error('Invalid saved meeting space. Save the room link again.');
  const token = await google.accessToken();
  async function get(resource, query = {}) {
    const endpoint = new URL(`https://meet.googleapis.com/v2/${resource}`);
    endpoint.search = new URLSearchParams(query);
    const response = await fetcher(endpoint, {headers: {Authorization: `Bearer ${token}`}, signal: AbortSignal.timeout(10_000)});
    if (!response.ok) {
      const message = response.status === 403 ? 'Enable Google Meet API and grant Meet monitoring access to the Portal account.' : response.status === 404 ? 'The saved Meet room no longer exists or is inaccessible. Check its link.' : `Meet monitoring unavailable (${response.status}). Retrying automatically.`;
      const error = new Error(message); error.status = response.status; throw error;
    }
    return response.json();
  }
  const space = await get(spaceName || `spaces/${normalized.split('/').pop()}`);
  if (!spacePattern.test(space.name || '') || (spaceName && space.name !== spaceName)) throw new Error('Google returned a different meeting space. Save and verify the room again.');
  const currentUrl = meetUrl(space.meetingUri);
  if (!currentUrl || currentUrl !== normalized) throw new Error('The Meet link changed. Update the room link and the shared redirect together.');
  const conference = space.activeConference?.conferenceRecord || null;
  const snapshot = {spaceName: space.name, url: currentUrl, conference, others: 0};
  if (!conference) return snapshot;
  if (!conferencePattern.test(conference)) throw new Error('Google returned an invalid conference identifier.');
  let pageToken;
  const participants = new Set();
  for (let page = 0; page < 20; page++) {
    const data = await get(`${conference}/participants`, {filter: 'latest_end_time IS NULL', pageSize: '250', ...(pageToken ? {pageToken} : {})});
    for (const participant of data.participants || []) {
      if (!participant.name || participant.latestEndTime) continue;
      if (participant.signedinUser?.user === `users/${google.tokens.sub}`) continue;
      participants.add(participant.name);
    }
    pageToken = data.nextPageToken;
    if (!pageToken) return {...snapshot, others: participants.size};
  }
  throw new Error('Participant list incomplete. Waiting for a complete room check.');
}

export function dropInEvent({now, snapshot, enabled, paused, verified, calendarFresh, active, history = {}}) {
  if (!enabled || paused || !verified || !calendarFresh || active || !snapshot || snapshot.error) return null;
  if (now < snapshot.checkedAt || now - snapshot.checkedAt > DROP_IN_FRESH_MS || !conferencePattern.test(snapshot.conference || '') || !(snapshot.others > 0)) return null;
  const id = `drop-in:${snapshot.conference}`;
  const h = history[id];
  if (h?.done || (h?.attempts || 0) >= 3 || h?.retryAfter > now) return null;
  return {id, source: 'drop-in', title: 'The room · Drop-in', url: snapshot.url, conference: snapshot.conference, start: now, end: null};
}

export function dropInParticipantCount({now, snapshot, conference}) {
  if (!snapshot || snapshot.error || now < snapshot.checkedAt || now - snapshot.checkedAt > DROP_IN_FRESH_MS) return null;
  if (snapshot.conference === null && snapshot.others === 0) return 1;
  if (snapshot.conference !== conference || !Number.isSafeInteger(snapshot.others) || snapshot.others < 0) return null;
  return snapshot.others + 1;
}

export function retryDropInEvent(context) {
  // An explicit local retry may reset failed attempts, but cannot interrupt a
  // call, bypass readiness, or undo a completed/manual departure.
  const event = dropInEvent({...context, history: {}});
  if (!event) throw new Error('Retry requires a current visitor, automatic joining enabled, a verified browser, and a fresh Calendar connection.');
  if (context.history?.[event.id]?.done) throw new Error('This visit has already ended. Start a new visit before retrying.');
  return event;
}
