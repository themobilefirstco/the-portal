import test from 'node:test';
import assert from 'node:assert/strict';
import {readDropInRoom, dropInEvent, retryDropInEvent, dropInParticipantCount, DROP_IN_LEAVE_SECONDS} from '../src/drop-in.mjs';
import {trackAttendance} from '../src/attendance.mjs';
import {decide} from '../src/schedule.mjs';

const url = 'https://meet.google.com/abc-defg-hij';
const space = {name: 'spaces/stable-room', meetingUri: url, activeConference: {conferenceRecord: 'conferenceRecords/call-1'}};
const google = {meetConnected: true, tokens: {sub: 'room-123'}, accessToken: async () => 'test-token'};
const participant = (name, user) => ({name, signedinUser: {user}});
const now = 1_000_000;
const snapshot = {spaceName: space.name, url, conference: 'conferenceRecords/call-1', others: 1, checkedAt: now};
const context = {now, snapshot, enabled: true, paused: false, verified: true, calendarFresh: true, active: null};

test('detects actual guests, excludes Portal itself, follows pagination, and pins the space identifier', async () => {
  const requests = [], responses = [space, {participants: [participant('self', 'users/room-123'), participant('guest-1', 'users/guest')], nextPageToken: 'next'}, {participants: [participant('guest-1', 'users/guest'), {name: 'guest-2', anonymousUser: {displayName: 'Visitor'}}]}];
  const result = await readDropInRoom({google, url, spaceName: space.name, fetcher: async (endpoint, options) => { requests.push({endpoint, options}); return {ok: true, json: async () => responses.shift()}; }});
  assert.equal(result.others, 2);
  assert.equal(requests[0].endpoint.pathname, '/v2/spaces/stable-room');
  assert.equal(requests[1].endpoint.searchParams.get('filter'), 'latest_end_time IS NULL');
  assert.equal(requests[2].endpoint.searchParams.get('pageToken'), 'next');
  assert.equal(requests[0].options.headers.Authorization, 'Bearer test-token');
});

test('an empty room needs no participant call and cannot trigger a visit', async () => {
  let requests = 0;
  const result = await readDropInRoom({google, url, fetcher: async () => { requests++; return {ok: true, json: async () => ({...space, activeConference: undefined})}; }});
  assert.equal(requests, 1); assert.equal(result.others, 0); assert.equal(result.conference, null);
  assert.equal(dropInEvent({...context, snapshot: {...result, checkedAt: now}}), null);
});

test('refuses wrong or reassigned links, missing authorization, and failed Meet API requests', async () => {
  await assert.rejects(readDropInRoom({google: {...google, meetConnected: false}, url}), /Connect Google Meet/);
  await assert.rejects(readDropInRoom({google, url: 'https://evil.example'}), /Google Meet meeting link/);
  await assert.rejects(readDropInRoom({google, url, spaceName: space.name, fetcher: async () => ({ok: true, json: async () => ({...space, name: 'spaces/different'})})}), /different meeting space/);
  await assert.rejects(readDropInRoom({google, url, fetcher: async () => ({ok: true, json: async () => ({...space, meetingUri: 'https://meet.google.com/xyz-abcd-efg'})})}), /link changed/);
  await assert.rejects(readDropInRoom({google, url, fetcher: async () => ({ok: false, status: 403})}), /Enable Google Meet API/);
});

test('only a fresh confirmed visitor starts the room; stale data, pause, another call, and calendar failure block it', () => {
  const event = dropInEvent(context);
  assert.equal(event.source, 'drop-in'); assert.equal(event.end, null);
  for (const change of [{enabled: false}, {paused: true}, {verified: false}, {calendarFresh: false}, {active: {}}, {snapshot: null}, {snapshot: {...snapshot, others: 0}}, {snapshot: {...snapshot, checkedAt: now - 16_000}}, {snapshot: {...snapshot, checkedAt: now + 1}}, {snapshot: {...snapshot, error: 'offline'}}]) assert.equal(dropInEvent({...context, ...change}), null);
});

test('manual leave, completed visits, and failed attempts cannot create a rejoin loop', () => {
  const {id} = dropInEvent(context);
  for (const record of [{done: true}, {attempts: 3}, {retryAfter: now + 1}]) assert.equal(dropInEvent({...context, history: {[id]: record}}), null);
  const later = {...snapshot, conference: 'conferenceRecords/call-2'};
  assert.ok(dropInEvent({...context, snapshot: later, history: {[id]: {done: true}}}));
});

test('an explicit retry permits failed visitor joins but preserves readiness and completed departures', () => {
  const event = dropInEvent(context);
  const history = {[event.id]: {attempts: 3, retryAfter: now + 60_000}};
  assert.equal(dropInEvent({...context, history}), null);
  assert.equal(retryDropInEvent({...context, history}).id, event.id);
  assert.deepEqual(history[event.id], {attempts: 3, retryAfter: now + 60_000});
  for (const change of [{enabled: false}, {paused: true}, {verified: false}, {calendarFresh: false}, {active: {}}, {snapshot: null}, {snapshot: {...snapshot, others: 0}}, {snapshot: {...snapshot, checkedAt: now - 16_000}}, {snapshot: {...snapshot, error: 'offline'}}, {history: {[event.id]: {done: true}}}]) {
    assert.throws(() => retryDropInEvent({...context, history, ...change}));
  }
});

test('scheduled calls preempt drop-ins without cancelling them for absence from Calendar', () => {
  const active = dropInEvent(context);
  const scheduled = {id: 'invitation', url: 'https://meet.google.com/xyz-abcd-efg', start: now, end: now + 60_000};
  const base = {now, lastSync: now, paused: false, active, history: {}};
  assert.equal(decide({...base, events: []}).type, 'hold');
  assert.equal(decide({...base, events: [scheduled]}).type, 'finish');
  assert.equal(decide({...base, events: [scheduled], lastSync: 0}).type, 'hold');
  assert.equal(decide({...base, events: [scheduled], active: {...scheduled, end: now + 120_000}}).type, 'hold');
});

test('departure uses fresh counts from the same conference and rejects stale or failed snapshots', () => {
  const base = {now, snapshot, conference: snapshot.conference};
  assert.equal(dropInParticipantCount(base), 2);
  assert.equal(dropInParticipantCount({...base, snapshot: {...snapshot, others: 0}}), 1);
  for (const change of [{conference: 'conferenceRecords/other'}, {now: now + 16_000}, {snapshot: {...snapshot, error: 'offline'}}]) assert.equal(dropInParticipantCount({...base, ...change}), null);
});

test('drop-ins close after 15 seconds of confirmed absence and cancel for a returning guest', () => {
  const observe = (previous, elapsed, visitors, extra = {}) => {
    const at = now + elapsed;
    const current = {...snapshot, others: visitors, checkedAt: at, ...extra};
    return trackAttendance(previous, {now: at, count: dropInParticipantCount({now: at, snapshot: current, conference: snapshot.conference}), delayMs: DROP_IN_LEAVE_SECONDS * 1000});
  };
  let state = observe(undefined, 0, 1);
  for (let elapsed = 3000; elapsed < 18000; elapsed += 3000) {
    state = observe(state, elapsed, 0);
    assert.equal(state.leave, false);
  }
  assert.equal(observe(state, 18000, 0).leave, true);
  assert.equal(observe(state, 18000, 1).deadline, null);
  assert.equal(observe(state, 18000, 0, {error:'offline'}).deadline, null);
});

test('an ended conference starts departure but another conference or stale data cannot', () => {
  const base = {now, snapshot: {...snapshot, conference:null, others:0}, conference:snapshot.conference};
  assert.equal(dropInParticipantCount(base), 1);
  assert.equal(dropInParticipantCount({...base, now:now + 16_000}), null);
  assert.equal(dropInParticipantCount({...base, snapshot:{...base.snapshot, error:'offline'}}), null);
  assert.equal(dropInParticipantCount({...base, snapshot:{...base.snapshot, conference:'conferenceRecords/new'}}), null);
});
