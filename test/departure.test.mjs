import test from 'node:test';
import assert from 'node:assert/strict';
import {Chrome} from '../src/chrome.mjs';

function room(respond) {
  const chrome = new Chrome('/unused-test-profile');
  chrome.target = 'owned-meeting'; chrome.session = 'session';
  chrome.displayTarget = 'dashboard'; chrome.displaySession = 'dashboard-session';
  chrome.send = respond;
  return chrome;
}
test('a failed close retains the target so departure can be retried', async () => {
  const chrome = room(async method => method === 'Target.closeTarget' ? {success:false} : method === 'Target.getTargets' ? {targetInfos:[{targetId:'owned-meeting'}]} : {});
  await assert.rejects(chrome.leave(), /could not close/);
  assert.equal(chrome.target, 'owned-meeting'); assert.equal(chrome.session, 'session');
});
test('confirmed closure succeeds even if Meet’s leave control is unavailable', async () => {
  const chrome = room(async (method, params) => { if (method === 'Runtime.evaluate') throw new Error('UI changed'); assert.equal(params.targetId,'owned-meeting'); return {success:true}; });
  await chrome.leave(); assert.equal(chrome.target, null); assert.equal(chrome.session, null);
  assert.equal(chrome.displayTarget,'dashboard'); assert.equal(chrome.displaySession,'dashboard-session');
});

test('a failed departure prevents a second meeting tab being opened', async () => {
  const chrome=room(async method=>{
    assert.notEqual(method,'Target.createTarget');
    return method==='Target.closeTarget' ? {success:false} : method==='Target.getTargets' ? {targetInfos:[{targetId:'owned-meeting'},{targetId:'dashboard'}]} : {};
  });
  chrome.start=async()=>{};
  await assert.rejects(chrome.open('about:blank'),/could not close/);
  assert.equal(chrome.target,'owned-meeting'); assert.equal(chrome.displayTarget,'dashboard');
});
test('an already-closed meeting target is treated as departed', async () => {
  const chrome = room(async method => { if (method === 'Target.closeTarget') throw new Error('No such target'); return {targetInfos:[]}; });
  await chrome.leave(); assert.equal(chrome.target, null);
});

test('returning to a dashboard recovers when its tab closes after the target listing', async () => {
  const chrome=room(async (method,params)=>{
    if(method==='Target.getTargets') return {targetInfos:[{targetId:'dashboard'}]};
    if(method==='Target.activateTarget'&&params.targetId==='dashboard') throw new Error('No target with given id found');
    if(method==='Target.createTarget') return {targetId:'new-dashboard'};
    if(method==='Target.attachToTarget') return {sessionId:'new-display-session'};
    if(method==='Page.navigate') assert.fail('The surviving dashboard must not be navigated.');
    return {};
  });
  chrome.start=async()=>{}; chrome.headless=true; chrome.displayUrl='about:blank';
  await chrome.showDisplay('about:blank');
  assert.equal(chrome.displayTarget,'new-dashboard');
  assert.equal(chrome.displaySession,'new-display-session');
  assert.equal(chrome.target,'owned-meeting');
});

test('a running Chrome with no windows recovers a dashboard window, then opens a separate meeting tab', async () => {
  const chrome = new Chrome('/unused-test-profile');
  const creations = []; let hasWindow = false;
  chrome.start = async () => {};
  chrome.send = async (method, params) => {
    if (method === 'Target.createTarget') {
      creations.push(params);
      if (!hasWindow && !params.newWindow) throw new Error('Failed to open new tab - no browser is open');
      hasWindow = true;
      return {targetId: params.url === 'about:blank#dashboard' ? 'dashboard' : 'meeting'};
    }
    if (method === 'Target.attachToTarget') return {sessionId: params.targetId + '-session'};
    if (method === 'Browser.getWindowForTarget') return {windowId: 1};
    if (method === 'Page.navigate' || method === 'Target.closeTarget') assert.fail('Recovery must not replace or close another tab.');
    return {};
  };
  await chrome.showDisplay('about:blank#dashboard');
  await chrome.open('about:blank#meeting');
  assert.deepEqual(creations.map(p => p.newWindow), [false, true, false]);
  assert.equal(chrome.displayTarget, 'dashboard');
  assert.equal(chrome.target, 'meeting');
});

test('a meeting tab recovers if the last window closes between dashboard and meeting creation', async () => {
  const chrome = new Chrome('/unused-test-profile');
  chrome.start = async () => {};
  const creations = [];
  chrome.send = async (method, params) => {
    if (method === 'Target.createTarget') {
      creations.push(params);
      if (!params.newWindow) throw new Error('Failed to open new tab - no browser is open');
      return {targetId: 'meeting'};
    }
    if (method === 'Target.attachToTarget') return {sessionId: 'meeting-session'};
    return {};
  };
  await chrome.open('about:blank');
  assert.deepEqual(creations.map(p => p.newWindow), [false, true]);
  assert.equal(chrome.target, 'meeting');
});

test('tab creation never retries ambiguous errors or loops when opening a new window also fails', async () => {
  for (const message of ['Chrome did not respond to Target.createTarget.', 'Failed to open new tab - no browser is open']) {
    const chrome = new Chrome('/unused-test-profile'); let attempts = 0;
    chrome.send = async () => { attempts++; throw new Error(message); };
    await assert.rejects(chrome.createTab('about:blank'), {message});
    assert.equal(attempts, message.startsWith('Failed to open') ? 2 : 1);
  }
});
