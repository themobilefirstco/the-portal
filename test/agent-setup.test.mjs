import test from 'node:test';
import assert from 'node:assert/strict';
import {configPlan} from '../src/config-plan.mjs';
import {doctorReport} from '../src/doctor-report.mjs';
import {KeychainStore} from '../src/secrets.mjs';

test('configuration rejects unknown fields and invented human verification', () => {
  for (const value of [{token:'no'}, {settings:{paused:'false'}}, {room:[]}, {setup:{devicesConfirmed:true}}, {settings:{aloneLeaveSeconds:5}}, null]) assert.throws(()=>configPlan(value));
});
test('configuration validates before any action and enables joining last', () => {
  assert.throws(()=>configPlan({room:{roomName:'Room',roomEmail:'bad',timeZone:'UTC'}}));
  assert.throws(()=>configPlan({dropIn:{url:'https://example.com',enabled:true,accessConfirmed:true}}));
  assert.throws(()=>configPlan({dropIn:{url:'https://meet.google.com/abc-defg-hij',enabled:true}}));
  assert.throws(()=>configPlan({brandedUrl:'http://meet.example.com/room'}));
  const plan=configPlan({room:{roomName:' Room ',roomEmail:'ROOM@EXAMPLE.COM',timeZone:'UTC'},brandedUrl:'https://meet.example.com/room',settings:{paused:false}});
  assert.deepEqual(plan.map(([route])=>route),['room','setup','settings']);
  assert.equal(plan[0][1].roomEmail,'room@example.com');
});
test('doctor distinguishes healthy, human handoff and operational errors without identifiers', () => {
  const status={health:{issues:[]},settings:{roomEmail:'private@example.com',setup:{devicesConfirmed:true,visitConfirmed:true}}};
  assert.equal(doctorReport(status).exitCode,0);
  assert.equal(JSON.stringify(doctorReport(status)).includes('private@example.com'),false);
  assert.equal(doctorReport({...status,health:{issues:['calendar_disconnected']}}).exitCode,1);
  assert.equal(doctorReport({...status,health:{issues:['controller_stalled']}}).exitCode,2);
  assert.equal(doctorReport({...status,settings:{}}).exitCode,1);
  assert.throws(()=>doctorReport({}));
});
test('local CLI Keychain reads suppress prompts and do not send secrets in argv', () => {
  let request;
  const secrets=new KeychainStore('/tmp/portal-synthetic', {noPrompt:true,run:(helper,args,options)=>{assert.deepEqual(args,[]);request=JSON.parse(options.input);return 'null';}});
  assert.equal(secrets.read('control-key'),null);
  assert.equal(request.noPrompt,true);
});
