import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
const unit = process.argv.includes('--unit');
const files = fs.readdirSync('test').filter(n => n.endsWith('.test.mjs') && (!unit || n !== 'browser.test.mjs')).map(n => `test/${n}`);
if (!unit && process.platform === 'darwin') {
  const {findChrome} = await import('../src/chrome.mjs');
  if (!findChrome()) { console.error('Install Google Chrome before the full browser test suite. Use npm run test:unit for logic tests only.'); process.exit(1); }
}
const result = spawnSync(process.execPath, ['--test', ...files], {stdio: 'inherit'});
process.exit(result.status ?? 1);
