import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Store} from '../src/store.mjs';
import {AgentError, AgentRequests, agentCommand, agentStatus, createAgentServer, roomHealth} from '../src/agent-api.mjs';
import {decide} from '../src/schedule.mjs';

const payload = {url: 'https://meet.google.com/abc-defg-hij', durationMinutes: 30};
const example = now => ({settings:{paused:false}, calendar:{connected:true,lastSync:now,error:''}, browser:{running:true,verified:true,error:''}, active:null, message:'Ready', activity:[], tokens:'SECRET', events:[{title:'private future meeting'}]});
function storage(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-agent-'));
  t.after(() => fs.rmSync(dir, {recursive:true,force:true})); return new Store(dir);
}
test('agent accepts only bounded Google Meet commands and an exact leave identity', () => {
  assert.equal(agentCommand('join', payload).durationMinutes,30);
  for (const value of [{url:'https://evil.example'}, {...payload,url:'https://meet.google.com.evil.example/abc-defg-hij'}, {...payload,durationMinutes:181}, {...payload,durationMinutes:0}, {...payload,allowMissingDevices:true}, {...payload,title:'x'.repeat(121)}, null]) assert.throws(() => agentCommand('join',value));
  assert.throws(() => agentCommand('leave',{}));
  assert.deepEqual(agentCommand('leave',{callId:'calendar:123'}),{callId:'calendar:123'});
});
test('health distinguishes idle readiness from observed device state and detects stale services', () => {
  const now = Date.now(), s = example(now);
  const health = roomHealth(s,{now,lastTickAt:now,startedAt:now-60_000});
  assert.equal(health.healthy,true); assert.equal(health.devices.camera,'not_checked');
  const broken = roomHealth({...s,calendar:{...s.calendar,lastSync:now-100_000},browser:{...s.browser,running:false}},{now,lastTickAt:now-31_000,startedAt:now});
  assert.deepEqual(broken.issues,['controller_stalled','calendar_stale','browser_closed']);
  const exposed = JSON.stringify(agentStatus(s,health)); assert.ok(!exposed.includes('SECRET')); assert.ok(!exposed.includes('private future meeting'));
});
test('agent calls survive absence from Calendar, expire, and yield to scheduled meetings', () => {
  const now = Date.now(), active={source:'agent',id:'agent:1',end:now+60_000};
  const base={now,lastSync:now,paused:false,active,events:[],history:{}};
  assert.equal(decide(base).type,'hold');
  assert.equal(decide({...base,now:active.end}).type,'finish');
  assert.equal(decide({...base,events:[{id:'invited:1',start:now,end:now+30_000}]}).type,'finish');
});
test('request retries are durable, conflicting reuse is rejected, and accepted is not joined', async t => {
  const store = storage(t), requests = new AgentRequests(store); let calls = 0;
  const action = async () => { calls++; return {callId:'agent:one'}; };
  const record = await requests.execute('join-test-001','join',payload,action);
  assert.equal(record.outcome,'accepted');
  await requests.execute('join-test-001','join',payload,action); assert.equal(calls,1);
  await assert.rejects(requests.execute('join-test-001','join',{...payload,durationMinutes:60},action), /different command/);
  requests.observe({id:'agent:one',phase:'in-call',mediaStartup:{verified:false}},'Joining'); assert.equal(record.outcome,'accepted');
  requests.observe({id:'agent:one',phase:'in-call',mediaStartup:{verified:true}},'Joined'); assert.equal(record.outcome,'joined');
  const restored = new AgentRequests(store);
  await restored.execute('join-test-001','join',payload,action); assert.equal(calls,1);
});
test('restart interrupts unresolved commands instead of replaying them', async t => {
  const store=storage(t), requests=new AgentRequests(store);
  await requests.execute('join-test-002','join',payload,async()=>({callId:'agent:two'}));
  const restored=new AgentRequests(store); assert.equal(restored.get('join-test-002').outcome,'interrupted');
  const record=await restored.execute('join-test-002','join',payload,async()=>{throw new Error('must not replay');});
  assert.equal(record.outcome,'interrupted');
});
test('entry failures remain distinct from successful admission', async t => {
  const requests=new AgentRequests(storage(t));
  const failed=await requests.execute('join-test-003','join',payload,async()=>{throw new AgentError(409,'A call is already active.');});
  assert.equal(failed.outcome,'failed'); assert.equal(failed.httpStatus,409);
  const accepted=await requests.execute('join-test-004','join',payload,async()=>({callId:'agent:four'}));
  requests.observe(null,'Host admission timed out'); assert.equal(accepted.outcome,'failed'); assert.match(accepted.error,/admission/);
});
test('HTTP API requires its own token, blocks browser requests, and handles duplicate commands once', async t => {
  const store=storage(t), requests=new AgentRequests(store);
  let config={enabled:false,token:'dedicated-test-token'}, calls=0, active=null, queue=Promise.resolve();
  const exclusive=fn=>{const result=queue.then(fn);queue=result.catch(()=>{});return result;};
  const server=createAgentServer({getConfig:()=>config,getStatus:()=>({health:{healthy:true},active}),requests,exclusive,
    join:async body=>{if(active)throw new AgentError(409,'Already active');calls++;active={callId:'agent:test',...body};return {callId:active.callId};},
    leave:async body=>{if(active?.callId!==body.callId)throw new AgentError(409,'Wrong call');active=null;return body;}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
  const base=`http://127.0.0.1:${server.address().port}`;
  const headers={Authorization:'Bearer dedicated-test-token','Content-Type':'application/json','Idempotency-Key':'http-join-001'};
  const post=(route,body,extra={})=>fetch(base+route,{method:'POST',headers:{...headers,...extra},body:JSON.stringify(body)});
  assert.equal((await fetch(base+'/v1/status',{headers})).status,401);
  config.enabled=true;
  assert.equal((await fetch(base+'/v1/status')).status,401);
  assert.equal((await fetch(base+'/v1/status',{headers:{Authorization:'Bearer local-control-key'}})).status,401);
  assert.equal((await post('/v1/join',payload,{Origin:'https://evil.example'})).status,403);
  assert.equal((await post('/v1/join',payload,{'Idempotency-Key':''})).status,400);
  assert.equal((await post('/v1/join',{...payload,url:'file:///etc/passwd'})).status,400);
  const responses=await Promise.all([post('/v1/join',payload),post('/v1/join',payload)]);
  assert.deepEqual(responses.map(r=>r.status),[202,202]); assert.equal(calls,1);
  const status=await (await fetch(base+'/v1/requests/http-join-001',{headers})).json();
  assert.equal(status.outcome,'accepted'); assert.equal('fingerprint' in status,false);
  assert.equal((await post('/v1/join',payload,{'Idempotency-Key':'http-join-002'})).status,409);
  assert.equal((await post('/v1/leave',{callId:'wrong-call'},{'Idempotency-Key':'http-leave-001'})).status,409); assert.ok(active);
  assert.equal((await post('/v1/leave',{callId:'agent:test'},{'Idempotency-Key':'http-leave-002'})).status,200); assert.equal(active,null);
  config.token='rotated-token'; assert.equal((await fetch(base+'/v1/status',{headers})).status,401);
});
