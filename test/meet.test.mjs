import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {inspectMeet, inspectAccount} from '../src/meet-page.mjs';
const ROOM_EMAIL = 'room@example.com';

function fixture({account=ROOM_EMAIL,labels=['Turn off microphone','Turn off camera','Join now'],body='',previewIdentity=false,allowMissingDevices=false,ensureInitialMedia=false,mediaAttempts={},cameraFrame=true,track={}}={}) {
  const clicked=[];
  const buttons=labels.map(value=>{
    const text=typeof value==='string'?value:value.label;
    const node={innerText:typeof value==='string'?value:(value.text??value.label),disabled:false,getAttribute:k=>k==='aria-label'?text:null,getClientRects:()=>value.hidden?[]:[{}],click:()=>clicked.push(text)};
    if(value.parentText) node.parentElement={innerText:value.parentText,parentElement:null,querySelectorAll:()=>value.mixedParent?[node,buttons[0]]:[node]};
    return node;
  });
  const avatar={innerText:'',getClientRects:()=>[{}],getAttribute:k=>k==='aria-label'?`Google Account: Portal (${account})`:null};
  const switcher={innerText:'Switch account',getClientRects:()=>[{}]};
  const video={getClientRects:()=>[{}],paused:false,readyState:cameraFrame?4:0,videoWidth:cameraFrame?1280:0,videoHeight:cameraFrame?720:0,srcObject:{getVideoTracks:()=>[{readyState:'live',enabled:true,muted:false,...track}]}};
  const context={document:{body:{innerText:body},querySelectorAll:s=>s==='button,[role="button"]'?buttons:s==='video'?[video]:s.includes('AccountChooser')?(previewIdentity?[switcher]:[]):previewIdentity?[]:[avatar]},getComputedStyle:()=>({visibility:'visible'})};
  const result=vm.runInNewContext(`(${inspectMeet.toString()})({...${JSON.stringify({email:ROOM_EMAIL,act:true,allowMissingDevices,ensureInitialMedia,mediaAttempts})}, verified:(${inspectAccount.toString()})(${JSON.stringify(ROOM_EMAIL)})})`,context);
  return {result,clicked};
}
test('joins only after verifying the room account and both devices on',()=>{const x=fixture();assert.equal(x.result.state,'joining');assert.deepEqual(x.clicked,['Join now']);});
test('turns disabled devices on, then waits for the next inspection before joining',()=>{const x=fixture({labels:['Turn on microphone','Turn on camera','Join now']});assert.equal(x.result.state,'devices-required');assert.deepEqual(x.clicked,['Turn on microphone','Turn on camera']);});
test('unknown account or missing devices never clicks Join',()=>{assert.equal(fixture({account:'other@example.com'}).result.state,'account-required');const x=fixture({labels:['Join now']});assert.equal(x.result.state,'devices-required');assert.equal(x.clicked.length,0);});
test('an in-call mute is preserved; the controller does not repeatedly unmute',()=>{const x=fixture({labels:['Turn on microphone','Leave call']});assert.equal(x.result.state,'in-call');assert.equal(x.clicked.length,0);});
test('host admission and ended calls are separate states',()=>{assert.equal(fixture({body:'Waiting for the host'}).result.state,'waiting');assert.equal(fixture({body:'You left the meeting'}).result.state,'ended');});
test('access rejection is never reported as a completed call',()=>{const x=fixture({body:"You can't join this video call"});assert.equal(x.result.state,'access-denied');assert.equal(x.clicked.length,0);});
test('current Meet preview verifies the email next to Switch account',()=>{
  assert.equal(fixture({previewIdentity:true,body:`${ROOM_EMAIL}\nSwitch account\nReady to join?`}).result.state,'joining');
  assert.equal(fixture({previewIdentity:true,body:`other@example.com\nSwitch account\nMeeting: ${ROOM_EMAIL}`}).result.state,'account-required');
});
test('missing hardware blocks normal joining even when toggle labels say on',()=>{const x=fixture({body:'Camera not found\nMic not found'});assert.equal(x.result.state,'devices-required');assert.equal(x.clicked.length,0);});
test('an explicit device-free test turns both controls off before joining',()=>{
  const off=fixture({allowMissingDevices:true,body:'Camera not found\nMic not found'});assert.equal(off.result.state,'devices-disabling');assert.deepEqual(off.clicked,['Turn off microphone','Turn off camera']);
  const join=fixture({allowMissingDevices:true,body:'Camera not found\nMic not found',labels:['Turn on microphone','Turn on camera','Join now without microphone & camera']});assert.equal(join.result.state,'joining');assert.deepEqual(join.clicked,['Join now without microphone & camera']);
  const normal=fixture({body:'Camera not found\nMic not found',labels:['Turn on microphone','Turn on camera','Join now without microphone & camera']});assert.notEqual(normal.result.state,'joining');assert.equal(normal.clicked.length,0);
});
test('camera-starting labels and missing live frames block joining despite on toggles',()=>{
  for(const extra of [{body:'Camera is starting'},{cameraFrame:false},{track:{readyState:'ended'}},{track:{enabled:false}},{track:{muted:true}}]) {
    const x=fixture(extra);assert.equal(x.result.state,'devices-starting');assert.equal(x.clicked.length,0);
  }
});
test('device problem controls block joining even without a missing-device message',()=>{
  for(const label of ['Camera problem. Show more info','Microphone problem. Show more info']) {
    const x=fixture({labels:['Turn off microphone','Turn off camera','Join now',label]});assert.equal(x.result.state,'devices-required');assert.equal(x.clicked.length,0);
  }
});
test('initial in-call auto-mutes are repaired at most once and never for device-free tests',()=>{
  const options={labels:['Turn on microphone','Turn on camera','Leave call'],ensureInitialMedia:true};
  const x=fixture(options);assert.deepEqual(x.clicked,['Turn on microphone','Turn on camera']);assert.equal(x.result.media.camera,'off');assert.equal(x.result.mediaActions.length,2);
  assert.equal(fixture({...options,mediaAttempts:{microphone:1,camera:1}}).clicked.length,0);
  assert.equal(fixture({...options,allowMissingDevices:true}).clicked.length,0);
});
test('reports actual in-call controls and treats contradictory labels as unknown',()=>{
  assert.equal(fixture({labels:['Turn off microphone','Turn off camera','Leave call']}).result.media.microphone,'on');
  assert.equal(fixture({labels:['Turn off camera','Turn on camera','Leave call']}).result.media.camera,'unknown');
});
test('counts participants from the People control and its single-control badge',()=>{
  for(const control of [{label:'Show everyone (2)',text:'people'},{label:'Show everyone',text:'people\n2'},{label:'Show everyone',text:'people',parentText:'2\npeople'},{label:'Show everyone',text:'people_alt',parentText:'2people_alt'}]) {
    const x=fixture({labels:['Leave call',control]});assert.equal(x.result.participantCount,2);assert.equal(x.clicked.length,0);
  }
  assert.equal(fixture({labels:['Leave call',{label:'Show everyone',text:'people',parentText:'1\npeople'}]}).result.participantCount,1);
});
test('unrelated numbers, hidden badges, mixed controls and conflicting counts are unknown',()=>{
  for(const control of ['Show everyone',{label:'Show everyone',text:'people',parentText:'1\npeople',mixedParent:true},{label:'Show everyone (2)',text:'1'},{label:'Show everyone',text:'1',hidden:true}]) {
    const x=fixture({labels:['Leave call',control],body:'Chat: 1 participant. You are the only one here.'});assert.equal(x.result.participantCount,null);
  }
});
