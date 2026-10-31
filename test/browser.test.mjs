import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {Chrome,findChrome} from '../src/chrome.mjs';
import {inspectMeet,inspectAccount} from '../src/meet-page.mjs';
const ROOM_EMAIL = 'room@example.com';


test('real Chrome pipe, Unicode framing, preview controls and call state', {skip:!findChrome(),timeout:30_000}, async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'portal-browser-')),chrome=new Chrome(dir,{headless:true});
  t.after(async()=>{await chrome.stop();await delay(400);fs.rmSync(dir,{recursive:true,force:true});});
  await chrome.open('about:blank');
  const evaluate=async expression=>(await chrome.send('Runtime.evaluate',{expression,returnByValue:true},chrome.session)).result.value;
  const html=`<button aria-label="Google Account: Portal (${ROOM_EMAIL})">Account</button><button aria-label="Turn off microphone">Mic</button><button aria-label="Turn off camera">Camera</button><button onclick="document.body.dataset.joined='yes'">Join now</button><h1>Portal · café 🌴</h1>`;
  await evaluate(`document.body.innerHTML=${JSON.stringify(html)}`);
  await evaluate(`(async()=>{const c=document.createElement('canvas');c.width=320;c.height=240;c.getContext('2d').fillRect(0,0,320,240);const v=document.createElement('video');v.muted=true;v.autoplay=true;v.srcObject=c.captureStream(10);document.body.append(v);await v.play();})()`);
  for(let i=0;i<30;i++){if(await evaluate('document.querySelector("video").readyState >= 2'))break;await delay(100);}
  assert.equal(await evaluate('document.querySelector("h1").innerText'),'Portal · café 🌴');
  assert.equal(await evaluate(`(${inspectAccount.toString()})('')`),false);
  assert.equal(await evaluate(`(${inspectAccount.toString()})('oom@example.com')`),false);
  assert.equal(await evaluate(`(${inspectAccount.toString()})('room@example.com')`),true);
  const result=await evaluate(`(${inspectMeet.toString()})({...${JSON.stringify({email:ROOM_EMAIL,act:true})}, verified:(${inspectAccount.toString()})(${JSON.stringify(ROOM_EMAIL)})})`);
  assert.equal(result.state,'joining');assert.equal(await evaluate('document.body.dataset.joined'),'yes');
  const inCall='<button aria-label="Leave call">Leave</button><button aria-label="Turn on microphone" onclick="document.body.dataset.unmuted=\'yes\'">Mic</button>';
  await evaluate(`document.body.innerHTML=${JSON.stringify(inCall)}`);
  assert.equal((await evaluate(`(${inspectMeet.toString()})(${JSON.stringify({email:ROOM_EMAIL,act:true})})`)).state,'in-call');
  assert.equal(await evaluate('document.body.dataset.unmuted || "no"'),'no');
  await chrome.leave();assert.equal(chrome.target,null);
});

test('calls use new tabs and returning preserves the dashboard and unrelated tabs', {skip:!findChrome(),timeout:30_000}, async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'portal-tabs-')), chrome=new Chrome(dir,{headless:true});
  t.after(async()=>{await chrome.stop();await delay(400);fs.rmSync(dir,{recursive:true,force:true});});
  await chrome.showDisplay('about:blank');
  const dashboard=chrome.displayTarget, session=chrome.displaySession;
  const evaluate=async expression=>(await chrome.send('Runtime.evaluate',{expression,returnByValue:true},session)).result.value;
  await evaluate('window.dashboardState={counter:42}; document.body.textContent="My dashboard"; location.hash="widgets"');
  const other=(await chrome.send('Target.createTarget',{url:'about:blank',newWindow:false})).targetId;
  await chrome.open('about:blank');
  const firstCall=chrome.target;
  assert.notEqual(firstCall,dashboard);
  const displayWindow=await chrome.send('Browser.getWindowForTarget',{targetId:dashboard});
  const callWindow=await chrome.send('Browser.getWindowForTarget',{targetId:firstCall});
  assert.equal(callWindow.windowId,displayWindow.windowId);
  await chrome.open('about:blank');
  const secondCall=chrome.target;
  assert.notEqual(secondCall,firstCall);
  await chrome.leave();
  await chrome.showDisplay('about:blank');
  const targets=(await chrome.send('Target.getTargets')).targetInfos.map(target=>target.targetId);
  assert.ok(targets.includes(dashboard)); assert.ok(targets.includes(other));
  assert.ok(!targets.includes(firstCall)); assert.ok(!targets.includes(secondCall));
  assert.equal(chrome.displayTarget,dashboard); assert.equal(chrome.displaySession,session);
  assert.equal(await evaluate('window.dashboardState.counter'),42);
  assert.equal(await evaluate('document.body.textContent'),'My dashboard');
  assert.equal(await evaluate('location.hash'),'#widgets');
  await chrome.send('Target.closeTarget',{targetId:dashboard});
  await chrome.showDisplay('about:blank');
  assert.notEqual(chrome.displayTarget,dashboard);
  assert.ok((await chrome.send('Target.getTargets')).targetInfos.some(target=>target.targetId===other));
});
