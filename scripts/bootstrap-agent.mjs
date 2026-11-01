import fs from 'node:fs';
import {localControl} from './local-control.mjs';
let fd;
try {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--token-file') throw new Error('Usage: runtime/node scripts/bootstrap-agent.mjs --token-file /private/path/portal-token');
  // Reserve an owner-only file before enabling access; never overwrite credentials or follow symlinks.
  fd = fs.openSync(args[1], 'wx', 0o600);
  const request = localControl();
  await request('agent-access', {enabled:true});
  const {token} = await request('agent-token', {});
  fs.writeFileSync(fd, token + '\n');
  console.log(JSON.stringify({ok:true, message:'Local bearer access enabled. Token saved to the requested owner-only file.'}));
} catch {
  console.log(JSON.stringify({ok:false,error:'Bootstrap failed. Check Keychain access, controller status, and an unused token-file path. Access may already be enabled; inspect room controls.'}));
  process.exitCode=2;
} finally { if (fd !== undefined) fs.closeSync(fd); }
