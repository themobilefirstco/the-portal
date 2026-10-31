import test from 'node:test';
import {spawn} from 'node:child_process';
import net from 'node:net';
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
  // CDP acknowledges a close request before the target necessarily disappears.
  let closed=false;
  for(let i=0;i<50;i++){
    closed=!(await chrome.send('Target.getTargets')).targetInfos.some(target=>target.targetId===dashboard);
    if(closed)break;
    await delay(100);
  }
  assert.equal(closed,true,'dashboard target should finish closing');
  await chrome.showDisplay('about:blank');
  assert.notEqual(chrome.displayTarget,dashboard);
  assert.ok((await chrome.send('Target.getTargets')).targetInfos.some(target=>target.targetId===other));
});


async function unusedPort() {
  const server=net.createServer();
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const port=server.address().port;
  await new Promise(resolve=>server.close(resolve));return port;
}

test('setup form preserves unsaved fields across status refresh and saves Unicode settings', {skip:!findChrome(),timeout:30_000}, async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'portal-onboarding-'));
  const port=await unusedPort(),agentPort=await unusedPort(),base=`http://127.0.0.1:${port}`;
  const child=spawn(process.execPath,['src/server.mjs'],{env:{...process.env,PORTAL_DATA_DIR:dir,PORTAL_PORT:String(port),PORTAL_AGENT_PORT:String(agentPort),PORTAL_NO_BROWSER:'1',PORTAL_TEST_MODE:'1'},stdio:'ignore'});
  const chrome=new Chrome(path.join(dir,'fixture-browser'),{headless:true});
  t.after(async()=>{await chrome.stop();child.kill('SIGTERM');await delay(400);fs.rmSync(dir,{recursive:true,force:true});});
  let up=false;for(let i=0;i<50;i++){try{up=(await fetch(base+'/health')).ok;if(up)break;}catch{}await delay(100);}assert.equal(up,true);
  const key=JSON.parse(fs.readFileSync(path.join(dir,'control-key.json'),'utf8'));
  await chrome.open(`${base}/#key=${key}`);
  const evaluate=async expression=>{
    const r=await chrome.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},chrome.session);
    assert.equal(r.exceptionDetails,undefined,JSON.stringify(r.exceptionDetails));return r.result.value;
  };
  for(let i=0;i<50;i++){if(await evaluate('typeof state !== "undefined" && Boolean(state)'))break;await delay(100);}
  assert.equal(await evaluate('Boolean(state)'),true);
  const result=await evaluate(`(async()=>{
    const name=document.getElementById('roomName'), email=document.getElementById('roomEmail');
    name.value='Café 🌍';name.dispatchEvent(new Event('input',{bubbles:true}));
    email.focus();await refresh();
    const preserved=name.value;
    email.value='new-room@example.com';document.getElementById('timeZone').value='Europe/Paris';
    await action('room',{roomName:name.value,roomEmail:email.value,timeZone:'Europe/Paris'},'roomForm');
    const saved=state.settings.roomName;
    name.value='';name.dispatchEvent(new Event('input',{bubbles:true}));
    await action('room',{roomName:'',roomEmail:email.value,timeZone:'Europe/Paris'},'roomForm');
    email.focus();await refresh();
    return {preserved,saved,invalidPreserved:name.value,dirty:dirtyForms.has('roomForm'),paused:state.settings.paused,hash:location.hash};
  })()`);
  assert.deepEqual(result,{preserved:'Café 🌍',saved:'Café 🌍',invalidPreserved:'',dirty:true,paused:true,hash:''});
});
