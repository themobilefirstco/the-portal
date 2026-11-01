import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {servicePlist} from '../src/service-plist.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const stateDir = '/Library/Application Support/The Portal/state';
const plist = servicePlist({
  label: 'org.theportal.room',
  nodePath: '/Library/Application Support/The Portal/app/runtime/node',
  serverPath: '/Library/Application Support/The Portal/app/src/server.mjs',
  workingDirectory: '/Library/Application Support/The Portal/app',
  stateDir,
  stdoutPath: '/Library/Application Support/The Portal/controller.log',
  stderrPath: '/Library/Application Support/The Portal/controller-error.log',
});
const environment = plist.match(/<key>EnvironmentVariables<\/key><dict>(.*?)<\/dict>/)[1];
assert.equal(environment, `<key>PORTAL_DATA_DIR</key><string>${stateDir}</string>`);
assert.equal(plist.includes('PORTAL_NON_INTERACTIVE'), false);
assert.equal(fs.readFileSync(new URL('../src/install.mjs', import.meta.url), 'utf8').includes('PORTAL_NON_INTERACTIVE'), false);
const escaped = servicePlist({
  label: 'org.theportal.room', nodePath: '/bin/node', serverPath: '/app/src/server.mjs',
  workingDirectory: '/app', stateDir: '/tmp/room&"state"', stdoutPath: '/tmp/out.log', stderrPath: '/tmp/err.log',
});
assert.match(escaped, /<key>PORTAL_DATA_DIR<\/key><string>\/tmp\/room&amp;&quot;state&quot;<\/string>/);
assert.equal(escaped.includes('PORTAL_NON_INTERACTIVE'), false);
for (const flag of ['--help', '-h']) {
  const help = spawnSync('bash', ['-x', 'setup.command', flag], {cwd: root, encoding: 'utf8'});
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /^Usage: setup\.command \[--non-interactive\] \[--no-open\] \[--skip-tests\] \[--uninstall\|--stop\]\n/);
  assert.equal(help.stderr.includes('bootstrap.sh'), false);
  assert.equal(`${help.stdout}${help.stderr}`.includes('nodejs.org'), false);
}

const unit = process.argv.includes('--unit');
const files = fs.readdirSync('test').filter(n => n.endsWith('.test.mjs') && (!unit || n !== 'browser.test.mjs')).map(n => `test/${n}`);
if (!unit && process.platform === 'darwin') {
  const {findChrome} = await import('../src/chrome.mjs');
  if (!findChrome()) { console.error('Install Google Chrome before the full browser test suite. Use npm run test:unit for logic tests only.'); process.exit(1); }
}
const result = spawnSync(process.execPath, ['--test', ...files], {stdio: 'inherit'});
process.exit(result.status ?? 1);
