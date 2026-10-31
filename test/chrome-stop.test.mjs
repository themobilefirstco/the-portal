import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {Chrome} from '../src/chrome.mjs';

test('headless shutdown waits for process closure rather than the close command response', async () => {
  const chrome=new Chrome('/unused',{headless:true}),child=new EventEmitter();
  child.exitCode=null;child.killed=false;child.kill=()=>{child.killed=true;};
  chrome.child=child;chrome.send=async()=>({});
  let done=false;const stop=chrome.stop().then(()=>done=true);
  await Promise.resolve();assert.equal(child.killed,true);assert.equal(done,false);
  child.exitCode=0;child.emit('close',0);await stop;assert.equal(done,true);
});
