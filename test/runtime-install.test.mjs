import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {installRuntime} from '../src/runtime-install.mjs';

function fixture(t) {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'portal-runtime-'));
  t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  const source=path.join(directory,'source'), destination=path.join(directory,'node');
  fs.writeFileSync(source,'new executable'); fs.writeFileSync(destination,'working executable');
  return {directory,source,destination};
}

test('runtime replacement swaps files instead of truncating the running executable',t=>{
  const {directory,source,destination}=fixture(t);
  const old=fs.openSync(destination,'r');
  t.after(()=>fs.closeSync(old));
  installRuntime(source,destination);
  assert.equal(fs.readFileSync(destination,'utf8'),'new executable');
  assert.equal(fs.readFileSync(old,'utf8'),'working executable');
  assert.equal(fs.statSync(destination).mode&0o777,0o755);
  assert.deepEqual(fs.readdirSync(directory).sort(),['node','source']);
});

test('a failed runtime copy preserves the previous executable and removes partial staging',t=>{
  const {directory,source,destination}=fixture(t);
  assert.throws(()=>installRuntime(source,destination,{copyFile:(_source,staged)=>{
    fs.writeFileSync(staged,'partial'); throw new Error('EIO');
  }}),/EIO/);
  assert.equal(fs.readFileSync(destination,'utf8'),'working executable');
  assert.deepEqual(fs.readdirSync(directory).sort(),['node','source']);
});
