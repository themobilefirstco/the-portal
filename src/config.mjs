import os from 'node:os';
import path from 'node:path';

export const VERSION = '0.1.0';
export const DATA_DIR = process.env.PORTAL_DATA_DIR || path.join(os.homedir(), 'Library/Application Support/The Portal/state');
export const DEFAULTS = Object.freeze({schemaVersion: 1, roomName: 'The Portal', roomEmail: '', timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  paused: true, dashboard: '', browserVerified: false, aloneLeaveSeconds: 60,
  dropInEnabled: false, dropInUrl: '', dropInSpace: '', dropInMaxMinutes: 180});

export function roomConfig(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Provide room settings.');
  const {roomName, roomEmail, timeZone} = input;
  if (typeof roomName !== 'string' || !roomName.trim() || roomName.trim().length > 80) throw new Error('Room name must contain 1–80 characters.');
  if (typeof roomEmail !== 'string' || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(roomEmail.trim()) || roomEmail.length > 254) throw new Error('Enter the Google account email used by this room.');
  if (typeof timeZone !== 'string') throw new Error('Choose a valid time zone.');
  try { new Intl.DateTimeFormat('en', {timeZone}).format(); } catch { throw new Error('Choose a valid time zone.'); }
  return {roomName: roomName.trim(), roomEmail: roomEmail.trim().toLowerCase(), timeZone};
}

export function portNumber(value, fallback) {
  const n = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(n) || n < 1024 || n > 65535) throw new Error('Use an unprivileged port between 1024 and 65535.');
  return n;
}
