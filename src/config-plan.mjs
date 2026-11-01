import fs from 'node:fs';
import {roomConfig} from './config.mjs';
import {brandedUrl} from './setup.mjs';
import {meetUrl, safeDashboard} from './schedule.mjs';
const schema = JSON.parse(fs.readFileSync(new URL('../config.schema.json', import.meta.url)));
export function validateShape(value, rule = schema, at = 'config') {
  const valid = rule.type === 'object' ? value !== null && typeof value === 'object' && !Array.isArray(value) : rule.type === 'integer' ? Number.isInteger(value) : typeof value === rule.type;
  if (!valid) throw new Error(`${at}: expected ${rule.type}`);
  if (rule.enum && !rule.enum.includes(value)) throw new Error(`${at}: unsupported value`);
  if (typeof value === 'string' && ((rule.minLength && value.length < rule.minLength) || (rule.maxLength && value.length > rule.maxLength))) throw new Error(`${at}: invalid length`);
  if (rule.type === 'object') {
    for (const key of rule.required || []) if (!(key in value)) throw new Error(`${at}.${key}: required`);
    for (const key of Object.keys(value)) {
      if (!Object.hasOwn(rule.properties, key)) throw new Error(`${at}: unknown field`);
      validateShape(value[key], rule.properties[key], `${at}.${key}`);
    }
  }
}
export function configPlan(config) {
  validateShape(config);
  const plan = [];
  if (config.room) plan.push(['room', roomConfig(config.room)]);
  if (config.dropIn) {
    const d = config.dropIn;
    if (d.url && !meetUrl(d.url)) throw new Error('Use a Google Meet URL.');
    if (d.enabled && (!d.url || d.accessConfirmed !== true)) throw new Error('A human must confirm Meet access rules before enabling drop-ins.');
  }
  if (config.settings?.dashboard) safeDashboard(config.settings.dashboard, 'http://127.0.0.1:4280/display');
  if (config.dropIn) plan.push(['drop-in', config.dropIn]);
  if ('brandedUrl' in config) plan.push(['setup', {brandedUrl:brandedUrl(config.brandedUrl)}]);
  // Enable joining last, after all preceding configuration succeeds.
  if (config.settings) plan.push(['settings', config.settings]);
  return plan;
}
