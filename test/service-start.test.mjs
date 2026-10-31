import test from 'node:test';
import assert from 'node:assert/strict';
import {startService} from '../src/service-start.mjs';

const config = {domain:'gui/501', label:'org.theportal.room', plist:'/test/portal.plist'};
test('service startup waits and recovers a transient registration failure', async () => {
  const calls = [], waits = []; let bootstraps = 0;
  await startService({...config, wait:async ms => waits.push(ms), launch:(...args) => {
    calls.push(args);
    if (args[0] === 'bootstrap') return ++bootstraps < 3 ? {status:5,stderr:'Input/output error'} : {status:0};
    assert.equal(args[0],'print'); return {status:113,stderr:'Service not found'};
  }});
  assert.equal(bootstraps,3); assert.deepEqual(waits,[1000,2000]);
  assert.deepEqual(calls[0],['bootstrap',config.domain,config.plist]);
});
test('service startup stops after bounded failures without disabling or unloading anything', async () => {
  for (const code of [5,1]) {
    let bootstraps = 0; const calls = [];
    await assert.rejects(startService({...config, wait:async()=>{}, launch:(...args) => {
      calls.push(args[0]);
      if (args[0] === 'bootstrap') { bootstraps++; return {status:code,stderr:'not started'}; }
      return {status:113};
    }}), /startup failed/);
    assert.equal(bootstraps,code===5 ? 4 : 1);
    assert.ok(calls.every(command=>['bootstrap','print'].includes(command)));
  }
});
test('a registered service is started once and a failed start is reported', async () => {
  for (const code of [0,1]) {
    const calls = [];
    const operation=startService({...config, wait:async()=>assert.fail('No wait needed'), launch:(...args)=>{
      calls.push(args);
      return args[0]==='bootstrap' ? {status:5,stderr:'already registered'} : args[0]==='print' ? {status:0} : {status:code,stderr:'start failed'};
    }});
    if(code) await assert.rejects(operation,/could not start/); else await operation;
    assert.deepEqual(calls.map(call=>call[0]),['bootstrap','print','kickstart']);
    assert.deepEqual(calls[2],['kickstart',`${config.domain}/${config.label}`]);
  }
});
