import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import path from 'node:path';
const child=spawn(path.resolve('dist/The Portal Test.app/Contents/MacOS/Portal'),[],{env:{...process.env,PORTAL_APP_SMOKE_TEST:'1'},stdio:['ignore','pipe','pipe']});
let output='', errors='';child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>errors+=d);
const timeout=setTimeout(()=>{child.kill('SIGTERM');},60_000);
const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve);});clearTimeout(timeout);
assert.equal(code,0,`Native app must start and shut down cleanly: ${errors.slice(-2000)}`);
assert.match(output,/PORTAL_NATIVE_SMOKE_OK/,'WKWebView must render the authenticated setup form');
await new Promise(r=>setTimeout(r,2500));
let alive=false;try{await fetch('http://127.0.0.1:43880/health',{signal:AbortSignal.timeout(1000)});alive=true;}catch{}
assert.equal(alive,false,'Quitting the native app must stop its controller');
console.log('Native smoke: authenticated WKWebView setup, blocked unfinished onboarding, and clean controller shutdown passed.');
