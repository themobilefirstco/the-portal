import {KeychainStore} from './secrets.mjs';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
const data = process.env.PORTAL_DATA_DIR || path.join(os.homedir(),'Library/Application Support/The Portal/state');
const origin = `http://127.0.0.1:${process.env.PORTAL_PORT || 4280}`;
let healthy = false;
for(let i=0;i<40;i++) { try { const r=await fetch(`${origin}/health`,{signal:AbortSignal.timeout(1000)});healthy=(await r.json()).app==='the-portal';if(healthy)break;}catch{} await delay(250); }
if (!healthy) { console.error('Run setup.command first to start the controller.');process.exitCode=1; }
else {
  const key=new KeychainStore(data).read('control-key');
  const child=spawn('/usr/bin/open',[`${origin}/#key=${encodeURIComponent(key)}`],{stdio:'ignore'});child.unref();
  console.log('Opened Portal room controls.');
}
