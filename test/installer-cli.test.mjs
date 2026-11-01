import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {servicePlist} from '../src/service-plist.mjs';

// Decode the real launchd document rather than depending on XML formatting.
test('login service retains room paths but not unattended-installer prompt suppression', {skip:process.platform!=='darwin'}, () => {
  const stateDir='/tmp/Room & "Studio" <test>/state';
  const xml=servicePlist({label:'org.theportal.room',nodePath:'/tmp/Room & Studio/runtime/node',serverPath:'/tmp/room/src/server.mjs',workingDirectory:'/tmp/room',stateDir,stdoutPath:'/tmp/room/out.log',stderrPath:'/tmp/room/err.log'});
  const result=spawnSync('/usr/bin/plutil',['-convert','json','-o','-','--','-'],{input:xml,encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  const plist=JSON.parse(result.stdout);
  assert.deepEqual(plist.EnvironmentVariables,{PORTAL_DATA_DIR:stateDir});
  assert.deepEqual(plist.ProgramArguments,['/tmp/Room & Studio/runtime/node','/tmp/room/src/server.mjs']);
  assert.equal(plist.WorkingDirectory,'/tmp/room');
  assert.equal(plist.RunAtLoad,true);
});

test('launcher help works without a runtime and never invokes bootstrap', t => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'portal-help-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  fs.copyFileSync(new URL('../setup.command',import.meta.url),path.join(dir,'setup.command'));
  fs.mkdirSync(path.join(dir,'scripts'));
  const marker=path.join(dir,'bootstrap-was-run');
  fs.writeFileSync(path.join(dir,'scripts/bootstrap.sh'),'#!/bin/bash\ntouch bootstrap-was-run\nexit 89\n');
  for(const flag of ['--help','-h']) {
    const result=spawnSync('/bin/bash',['setup.command',flag],{cwd:dir,encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);
    assert.match(result.stdout,/Usage: setup\.command/);
    assert.equal(fs.existsSync(marker),false);
  }
});

test('installer directly accepts both help aliases without changing service state', () => {
  for(const flag of ['--help','-h']) {
    const result=spawnSync(process.execPath,['src/install.mjs',flag],{encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);
    assert.match(result.stdout,/Usage: setup\.command/);
  }
});
