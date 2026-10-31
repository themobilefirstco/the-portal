import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DEFAULTS, roomConfig, portNumber} from '../src/config.mjs';
import {normalizeEvents} from '../src/schedule.mjs';
import {roomHealth} from '../src/agent-api.mjs';
import {SnapshotPoller} from '../src/poller.mjs';
import {KeychainStore} from '../src/secrets.mjs';
import {deploy} from '../src/deployment.mjs';
import {GoogleCalendar} from '../src/google.mjs';

test('a new installation is paused, has no company account, and validates room settings', () => {
  assert.equal(DEFAULTS.paused, true); assert.equal(DEFAULTS.roomEmail, '');
  assert.deepEqual(roomConfig({roomName:'  Paris ',roomEmail:' ROOM@EXAMPLE.COM ',timeZone:'Europe/Paris'}), {roomName:'Paris',roomEmail:'room@example.com',timeZone:'Europe/Paris'});
  for (const value of [{}, {roomName:'Room',roomEmail:'bad',timeZone:'UTC'}, {roomName:'Room',roomEmail:'room@example.com',timeZone:'Mars/Test'}]) assert.throws(() => roomConfig(value));
  for (const value of ['abc',0,1023,65536,4280.5]) assert.throws(() => portNumber(value,4280));
});

test('a fork can schedule a different account without editing code', () => {
  const e={id:'one',start:{dateTime:'2026-10-31T12:00:00Z'},end:{dateTime:'2026-10-31T13:00:00Z'},attendees:[{email:'london@example.com'}],hangoutLink:'https://meet.google.com/abc-defg-hij'};
  assert.equal(normalizeEvents([e], 'london@example.com').length,1);
  assert.equal(normalizeEvents([e], 'paris@example.com').length,0);
  assert.equal(normalizeEvents([e]).length,0);
});

test('missing dashboard and failed guest monitoring cannot be healthy', () => {
  const now=100000, s={calendar:{connected:true,lastSync:now},browser:{running:true,verified:true,dashboardOpen:false},settings:{paused:false,dropInEnabled:true},dropIn:{connected:true,checkedAt:now,error:'offline'},active:null};
  assert.deepEqual(roomHealth(s,{now,lastTickAt:now,startedAt:now}).issues,['display_closed','drop_in_unavailable']);
  s.browser.dashboardOpen=true;s.dropIn.error='';s.dropIn.checkedAt=now-16000;
  assert.equal(roomHealth(s,{now,lastTickAt:now,startedAt:now}).healthy,false);
});

test('slow polling permits independent commands and publishes only a complete result', async () => {
  let resolve, snapshot=null, calls=0;
  const poller=new SnapshotPoller({read:()=>{calls++;return new Promise(r=>resolve=r);},publish:x=>snapshot=x,failed:()=>assert.fail()});
  const pending=poller.refresh();poller.refresh();assert.equal(calls,1);
  let left=false;await Promise.resolve().then(()=>left=true);assert.equal(left,true);assert.equal(snapshot,null);
  resolve(['complete']);await pending;assert.deepEqual(snapshot,['complete']);
});

test('disconnect invalidation prevents an old Calendar response from repopulating events', async () => {
  let resolve, published=false;
  const poller=new SnapshotPoller({read:()=>new Promise(r=>resolve=r),publish:()=>published=true,failed:()=>assert.fail()});
  const pending=poller.refresh();poller.invalidate();resolve(['old-account']);await pending;assert.equal(published,false);
});

test('polling failures are reported and rate-limited without replacing the previous snapshot', async () => {
  let n=0, error='';const p=new SnapshotPoller({read:async()=>{n++;throw Error('offline');},publish:()=>assert.fail(),failed:e=>error=e.message,now:()=>100});
  await p.refresh();await p.refresh();assert.equal(n,1);assert.equal(error,'offline');
});

test('Keychain transport never places secrets in process arguments and isolates installations', () => {
  const calls=[];const run=(exe,args,options)=>{calls.push({exe,args,options});return 'null';};
  const s=new KeychainStore('/tmp/portal-one',{helper:'/fake/helper',run});
  s.write('google-tokens',{refresh_token:'fixture-secret'});assert.deepEqual(calls[0].args,[]);
  assert.ok(calls[0].options.input.includes('fixture-secret'));assert.equal(calls[0].options.stdio[2],'pipe');
  assert.notEqual(s.service,new KeychainStore('/tmp/portal-two',{run}).service);
  assert.throws(()=>new KeychainStore('/tmp/portal',{run:()=>{throw Error('PRIVATE DATA');}}).read('google-tokens'),e=>!e.message.includes('PRIVATE DATA'));
});

function fixture(t) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'portal-deploy-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const source=path.join(root,'source'),destination=path.join(root,'app');fs.mkdirSync(source);fs.mkdirSync(destination);
  fs.writeFileSync(path.join(source,'version'),'new');fs.writeFileSync(path.join(destination,'version'),'old');return {root,source,destination};
}
test('failed activation restores the complete previous installation and restarts it', async t => {
  const f=fixture(t);let starts=0;
  await assert.rejects(deploy({...f,entries:['version'],stop:async()=>{},start:async()=>{starts++;},verify:async()=>{throw Error('unhealthy');}}),/unhealthy/);
  assert.equal(fs.readFileSync(path.join(f.destination,'version'),'utf8'),'old');assert.equal(starts,2);
  assert.equal(fs.readdirSync(f.root).some(x=>x.startsWith('.stage')),false);
});
test('staging failure never stops the working service', async t => {
  const f=fixture(t);let stopped=false;
  await assert.rejects(deploy({...f,entries:['missing'],stop:async()=>stopped=true,start:async()=>{},verify:async()=>{}}));
  assert.equal(stopped,false);assert.equal(fs.readFileSync(path.join(f.destination,'version'),'utf8'),'old');
});
test('successful installation removes its backup only after health verification', async t => {
  const f=fixture(t);
  await deploy({...f,entries:['version'],stop:async()=>{},start:async()=>{},verify:async()=>{assert.equal(fs.readFileSync(path.join(f.destination,'version'),'utf8'),'new');assert.ok(fs.readdirSync(f.root).some(x=>x.startsWith('.previous')));}});
  assert.equal(fs.readdirSync(f.root).some(x=>x.startsWith('.previous')),false);
});
test('Google authorization is bound to the configured account and uses the supplied secret store', async () => {
  const values=new Map(),config={roomEmail:'second@example.com'},store={read:()=>config},secrets={read:k=>values.get(k),write:(k,v)=>values.set(k,v)};
  let calls=0;const g=new GoogleCalendar(store,async()=>({ok:true,json:async()=>++calls===1?{access_token:'fixture',refresh_token:'fixture',expires_in:3600}:{email:config.roomEmail,email_verified:true,sub:'second-account'}}),{secrets,settings:()=>config});
  g.saveClient({installed:{client_id:'fixture.apps.googleusercontent.com',client_secret:'fixture'}});
  g.begin('http://127.0.0.1:4280/oauth/callback');await g.complete('fixture',g.pending.state);
  assert.equal(g.connected,true);assert.equal(values.get('google-tokens').email,config.roomEmail);
});
