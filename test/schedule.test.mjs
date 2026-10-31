import test from 'node:test';
import assert from 'node:assert/strict';
const ROOM_EMAIL = 'room@example.com';
import {decide, meetUrl, normalizeEvents, safeDashboard, manualJoinEvent} from '../src/schedule.mjs';
const now = Date.parse('2026-09-24T14:00:00-04:00');
const raw = (extra = {}) => ({id: 'one', summary: 'Team meeting', start: {dateTime: '2026-09-24T14:00:00-04:00'}, end: {dateTime: '2026-09-24T14:30:00-04:00'}, attendees: [{email: ROOM_EMAIL, responseStatus: 'accepted'}], hangoutLink: 'https://meet.google.com/abc-defg-hij', ...extra});
const events = normalizeForRoom([raw()]);
const context = extra => ({now, events, lastSync: now, paused: false, active: null, history: {}, ...extra});
test('requires an explicit room invitation, valid duration, Meet link, and timed event', () => {
  const bad = [raw({status:'cancelled'}), raw({attendees:[]}), raw({attendees:[{email:ROOM_EMAIL,responseStatus:'declined'}]}), raw({start:{date:'2026-09-24'}}), raw({end:{dateTime:'2026-09-24T13:00:00-04:00'}}), raw({hangoutLink:'https://evil.example/abc-defg-hij'})];
  assert.equal(normalizeForRoom(bad).length, 0); assert.equal(events.length, 1);
});
test('extracts a Meet conference entry and handles daylight-saving offsets', () => {
  const e = normalizeForRoom([raw({hangoutLink:null, conferenceData:{entryPoints:[{entryPointType:'video',uri:'https://meet.google.com/abc-defg-hij?authuser=1'}]}})])[0];
  assert.equal(e.url,'https://meet.google.com/abc-defg-hij'); assert.equal(e.start,now);
  const winter = normalizeForRoom([raw({start:{dateTime:'2026-12-01T14:00:00-05:00'},end:{dateTime:'2026-12-01T14:30:00-05:00'}})])[0];
  assert.equal(new Date(winter.start).toISOString(),'2026-12-01T19:00:00.000Z');
});
test('rejects URL tricks and non-Meet locations', () => {
  for (const link of ['javascript:alert(1)','https://meet.google.com.evil.test/abc-defg-hij','https://meet.google.com@evil.test/abc-defg-hij','https://meet.google.com:1234/abc-defg-hij','http://meet.google.com/abc-defg-hij','https://meet.google.com/lookup/secret']) assert.equal(meetUrl(link),null);
});
test('joins once at start; never before, with stale data, when paused, or after manual leave', () => {
  assert.equal(decide(context()).type,'start');
  for (const extra of [{now:now-1},{lastSync:0},{lastSync:now-91_000},{paused:true},{history:{[events[0].id]:{done:true}}},{history:{[events[0].id]:{attempts:3}}},{history:{[events[0].id]:{retryAfter:now+1}}}]) assert.equal(decide(context(extra)).type,'idle');
});
test('does not join missed meetings; can recover a previously active call', () => {
  assert.equal(decide(context({now:now+6*60_000,lastSync:now+6*60_000})).type,'idle');
  assert.equal(decide(context({now:now+6*60_000,lastSync:now+6*60_000,history:{[events[0].id]:{wasActive:true,attempts:1}}})).type,'start');
});
test('active calls end on deadline or cancellation, not overlap or pause', () => {
  assert.equal(decide(context({active:events[0],paused:true})).type,'hold');
  assert.equal(decide(context({active:events[0],events:[]})).type,'finish');
  assert.equal(decide(context({active:events[0],events:[],lastSync:0})).type,'hold');
  assert.equal(decide(context({active:events[0],now:events[0].end})).type,'finish');
});
test('a previously active extended call can recover after its original end', () => {
  const afterEnd=events[0].end+60_000;
  assert.equal(decide(context({now:afterEnd,lastSync:afterEnd,history:{[events[0].id]:{wasActive:true,attempts:1,extension:15*60_000}}})).type,'start');
});
test('dashboard URLs cannot run script or leak embedded credentials', () => {
  for (const url of ['javascript:alert(1)','file:///etc/passwd','https://u:p@example.com','http://example.com','https://meet.google.com/abc-defg-hij']) assert.throws(()=>safeDashboard(url,'fallback'));
  assert.equal(safeDashboard('', 'fallback'),'fallback');
  assert.equal(safeDashboard('http://localhost:3000','fallback'),'http://localhost:3000/');
});
test('manual retry permits an ongoing missed invitation but rejects stale, cancelled, future, ended and overlapping calls',()=>{
  const input={id:events[0].id,now:now+10*60_000,lastSync:now+10*60_000,events,active:null,verified:true};
  assert.equal(manualJoinEvent(input),events[0]);
  for(const extra of [{id:'unknown'},{events:[]},{lastSync:0},{lastSync:now},{now:now-1},{now:events[0].end},{active:events[0]},{verified:false}]) assert.throws(()=>manualJoinEvent({...input,...extra}));
});

function normalizeForRoom(items, email = ROOM_EMAIL) { return normalizeEvents(items, email); }
