import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {VERSION} from '../src/config.mjs';

const files = [];
function walk(dir) {
  for (const item of fs.readdirSync(dir, {withFileTypes: true})) {
    if (['.git','runtime','node_modules'].includes(item.name)) continue;
    const p = path.join(dir, item.name);
    if (item.isDirectory()) walk(p); else files.push(p);
  }
}
walk('.');
const problems = [];
for (const file of files) {
  if (/\.(mjs|js)$/.test(file)) {
    const r = spawnSync(process.execPath, ['--check', file], {encoding: 'utf8'});
    if (r.status !== 0) problems.push(`Syntax: ${file}\n${r.stderr}`);
  }
  // Binary assets are reviewed visually; don't decode GIF bytes as source text.
  if (/\.(gif|png|jpg|jpeg|webp|ttf|woff2)$/i.test(file)) continue;
  const text = fs.readFileSync(file, 'utf8');
  const patterns = [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, /AIza[0-9A-Za-z_-]{30,}/, /GOCSPX-[0-9A-Za-z_-]{15,}/, /1\/\/[0-9A-Za-z_-]{30,}/, /gh[pousr]_[0-9A-Za-z]{20,}/];
  if (patterns.some(p => p.test(text))) problems.push(`Potential credential: ${file}`);
  if (file.endsWith('.md')) for (const match of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const target = match[1].split('#')[0];
    if (!target || /^[a-z]+:\/\//.test(target)) continue;
    if (!fs.existsSync(path.resolve(path.dirname(file), decodeURIComponent(target)))) problems.push(`Broken documentation link: ${file} -> ${target}`);
  }
}
if (JSON.parse(fs.readFileSync('package.json')).version !== VERSION) problems.push('Package and runtime versions differ.');
for (const command of ['setup.command','Open Portal.command','Stop Portal.command']) if (!(fs.statSync(command).mode & 0o111)) problems.push(`${command} is not executable.`);
if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
console.log(`Checked ${files.length} source/documentation files: syntax, links, versions, launcher permissions and credential patterns.`);
