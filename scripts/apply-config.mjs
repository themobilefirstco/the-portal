import fs from 'node:fs';
import path from 'node:path';
import {configPlan} from '../src/config-plan.mjs';
import {localControl} from './local-control.mjs';
const applied = [];
try {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--file') throw new Error('Usage: runtime/node scripts/apply-config.mjs --file /private/path/room.json');
  const config = JSON.parse(fs.readFileSync(args[1], 'utf8'));
  const plan = configPlan(config);
  if (config.googleClientFile) {
    const client = JSON.parse(fs.readFileSync(path.resolve(path.dirname(args[1]),config.googleClientFile), 'utf8'));
    plan.splice(config.room ? 1 : 0, 0, ['client',client]);
  }
  const request = localControl();
  for (const [route,body] of plan) { await request(route,body); applied.push(route); }
  console.log(JSON.stringify({ok:true, applied, next:'Run scripts/doctor.mjs. Human consent and device verification are never inferred.'}));
} catch (error) {
  // Do not print malformed JSON contents or imported client credentials.
  console.log(JSON.stringify({ok:false, applied, error:error instanceof SyntaxError ? 'Invalid JSON file.' : error.message}));
  process.exitCode = 2;
}
