import test from 'node:test';
import assert from 'node:assert/strict';
import {checkInitialMedia, trackCaptureStartup} from '../src/media-startup.mjs';
const on = {microphone:'on',camera:'on'};
test('a stuck camera gets one browser recovery before joining, never during a call',()=>{
  const start=trackCaptureStartup(undefined,{now:1000,state:'devices-starting'});assert.equal(start.restart,false);
  const recovery=trackCaptureStartup(start,{now:21000,state:'devices-starting'});assert.equal(recovery.restart,true);
  const later=trackCaptureStartup(recovery,{now:41000,state:'devices-starting'});assert.equal(later.restart,false);
  assert.equal(trackCaptureStartup(start,{now:21000,state:'devices-starting',wasInCall:true}).restart,false);
  assert.equal(trackCaptureStartup(start,{now:21000,state:'waiting'}).since,null);
});
test('requires stable post-entry confirmation and preserves subsequent manual mutes',()=>{
  const first=checkInitialMedia(null,{now:1000,media:on});assert.equal(first.verified,false);
  const stable=checkInitialMedia(first,{now:4000,media:on});assert.equal(stable.verified,true);
  assert.equal(checkInitialMedia(stable,{now:7000,media:{microphone:'off',camera:'off'}}),stable);
});
test('a mute, unknown state, or observation gap restarts media confirmation',()=>{
  const first=checkInitialMedia(null,{now:1000,media:on});
  for(const extra of [{now:2000,media:{microphone:'off',camera:'on'}},{now:2000,media:{}},{now:9000,media:on}]) {
    const state=checkInitialMedia(first,extra);assert.equal(state.verified,false);
  }
});
test('counts each attempted repair and fails after twenty seconds without both devices on',()=>{
  const first=checkInitialMedia(null,{now:1000,media:{camera:'off'},actions:['camera','microphone']});
  assert.deepEqual(first.attempts,{camera:1,microphone:1});
  const timedOut=checkInitialMedia(first,{now:21000,media:{camera:'on',microphone:'unavailable'}});
  assert.equal(timedOut.failed,true);assert.equal(timedOut.verified,false);
});
test('explicit device-free tests skip initial enablement verification',()=>{
  const result=checkInitialMedia(null,{now:1000,media:{},allowMissingDevices:true});
  assert.equal(result.verified,true);assert.equal(result.test,true);
});
