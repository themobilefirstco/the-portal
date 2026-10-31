import test from 'node:test';
import assert from 'node:assert/strict';
import {GoogleCalendar,validateClient} from '../src/google.mjs';
const ROOM_EMAIL = 'room@example.com';

import {MEET_SCOPE} from '../src/drop-in.mjs';
function store(values = {}) { values.settings ??= {roomEmail: ROOM_EMAIL}; return {read:(k,f=null)=>values[k]??f,write:(k,v)=>{values[k]=v;},values}; }
const client = {installed:{client_id:'example.apps.googleusercontent.com',client_secret:'test-secret'}};
test('requires Desktop app credentials',()=>{ assert.throws(()=>validateClient({web:client.installed})); assert.equal(validateClient(client).client_id,client.installed.client_id); });
test('OAuth uses PKCE, state, offline access, and the room hint',()=>{
  const g = new GoogleCalendar(store()); g.saveClient(client); const u = new URL(g.begin('http://127.0.0.1:4280/oauth/callback'));
  assert.equal(u.searchParams.get('code_challenge_method'),'S256'); assert.equal(u.searchParams.get('access_type'),'offline'); assert.equal(u.searchParams.get('login_hint'),ROOM_EMAIL); assert.ok(u.searchParams.get('state').length>30);
});
test('rejects callback without matching state before any network request',async()=>{
  let fetched=false; const g = new GoogleCalendar(store(),()=>{fetched=true;});g.saveClient(client);g.begin('http://127.0.0.1:4280/oauth/callback');
  await assert.rejects(g.complete('code','bad'));assert.equal(fetched,false);
});
test('Meet monitoring is opt-in and reconnecting Calendar preserves an existing Meet grant',()=>{
  const g = new GoogleCalendar(store()); g.saveClient(client);
  assert.equal(new URL(g.begin('http://localhost/callback')).searchParams.get('scope').includes(MEET_SCOPE), false);
  assert.equal(new URL(g.begin('http://localhost/callback', {meet: true})).searchParams.get('scope').includes(MEET_SCOPE), true);
  g.tokens = {email: ROOM_EMAIL, refresh_token: 'test', scope: MEET_SCOPE};
  assert.equal(new URL(g.begin('http://localhost/callback')).searchParams.get('scope').includes(MEET_SCOPE), true);
});
test('refuses tokens from the wrong Google account',async()=>{
  let calls=0;const g=new GoogleCalendar(store(),async()=>({ok:true,json:async()=>++calls===1?{access_token:'test',refresh_token:'test'}:{email:'someone@example.com',email_verified:true}}));
  g.saveClient(client);g.begin('http://127.0.0.1:4280/oauth/callback');await assert.rejects(g.complete('code',g.pending.state),/Please connect/);assert.equal(g.connected,false);
});
test('follows Calendar pagination instead of silently dropping invitations',async()=>{
  const responses=[{items:[{id:1}],nextPageToken:'page2'},{items:[{id:2}]}],urls=[];
  const g=new GoogleCalendar(store({'google-client':client.installed,'google-tokens':{email:ROOM_EMAIL,refresh_token:'test',access_token:'test',expires_at:Date.now()+3600_000}}),async(url)=>{urls.push(String(url));return {ok:true,json:async()=>responses.shift()};});
  assert.deepEqual(await g.events(),[{id:1},{id:2}]);assert.ok(urls[1].includes('pageToken=page2'));assert.ok(urls[0].includes('singleEvents=true'));
});
