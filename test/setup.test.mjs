import test from 'node:test';
import assert from 'node:assert/strict';
import {brandedUrl,updateSetup,SETUP_DEFAULTS} from '../src/setup.mjs';
const ready={connected:true,verified:true};
const room={dropInEnabled:true,dropInUrl:'https://meet.google.com/abc-defg-hij',setup:{...SETUP_DEFAULTS}};
test('branded room URLs normalize safely without fetching a remote host',()=>{
  assert.equal(brandedUrl(' https://meet.example.com/miami/ '),'https://meet.example.com/miami');
  assert.equal(brandedUrl(''),'');
  for(const value of ['http://meet.example.com/miami','https://user:password@meet.example.com/miami','https://meet.example.com/miami?token=secret','https://meet.example.com/miami#secret','https://meet.google.com/abc-defg-hij','https://127.0.0.1/miami','https://localhost/miami','https://meet.example.com/','https://meet.example.com/:wildcard','javascript:alert(1)']) assert.throws(()=>brandedUrl(value));
});
test('setup cannot claim completion without real account checks and explicit user confirmations',()=>{
  assert.throws(()=>updateSetup({completed:true},room,ready),/Finish/);
  assert.throws(()=>updateSetup({devicesConfirmed:true},room,{connected:true,verified:false}),/Verify/);
  const confirmed={...room,setup:{...SETUP_DEFAULTS,devicesConfirmed:true,visitConfirmed:true}};
  assert.throws(()=>updateSetup({completed:true},confirmed,{connected:false,verified:true}),/Finish/);
  assert.equal(updateSetup({completed:true},confirmed,ready).completed,true);
  assert.throws(()=>updateSetup({devicesConfirmed:'true'},room,ready),/true or false/);
  assert.throws(()=>updateSetup({token:'fixture'},room,ready),/Invalid/);
});
test('changing a branded address invalidates the old confirmation and requires an enabled Meet room',()=>{
  const settings={...room,setup:{...SETUP_DEFAULTS,brandedUrl:'https://meet.example.com/old',linkConfirmed:true,devicesConfirmed:true,visitConfirmed:true,completed:true}};
  const changed=updateSetup({brandedUrl:'https://meet.example.com/new'},settings,ready);
  assert.equal(changed.linkConfirmed,false);assert.equal(changed.completed,false);
  assert.throws(()=>updateSetup({brandedUrl:'https://meet.example.com/new'},{...room,dropInEnabled:false},ready),/dedicated Meet/);
  assert.throws(()=>updateSetup({linkConfirmed:true},room,ready),/Save a branded/);
  assert.equal(updateSetup({visitConfirmed:false},settings,ready).completed,false);
});
test('optional branded links do not block a tested scheduled-meeting setup',()=>{
  const settings={dropInEnabled:false,setup:{...SETUP_DEFAULTS,devicesConfirmed:true}};
  const result=updateSetup({visitConfirmed:true,completed:true},settings,ready);
  assert.equal(result.brandedUrl,'');assert.equal(result.completed,true);
});
