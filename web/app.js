const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.hash.slice(1));
if (params.has('key')) { sessionStorage.setItem('portal-key', params.get('key')); history.replaceState(null, '', '/'); }
const key = sessionStorage.getItem('portal-key');
let state, busy = false;
const dirtyForms = new Set();
for (const id of ['roomForm','dashboardForm','departureForm','brandForm']) $(id).addEventListener('input', () => dirtyForms.add(id));
const testWithoutDevices = new Set();
const time = ms => new Intl.DateTimeFormat('en-US', {hour: 'numeric', minute: '2-digit', timeZone: state?.settings.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone}).format(ms);
const dateTime = ms => new Intl.DateTimeFormat('en-US', {weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: state?.settings.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone}).format(ms);
function toast(text, error = false) { $('toast').textContent = text; $('toast').classList.toggle('error', error); $('toast').hidden = false; }
async function api(path, body) {
  const response = await fetch(`/api/${path}`, {method: body === undefined ? 'GET' : 'POST', headers: {'x-room-token': key || '', 'Content-Type': 'application/json'}, ...(body === undefined ? {} : {body: JSON.stringify(body)})});
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'The controller could not complete this request.');
  return data;
}
function render(s) {
  state = s;
  document.querySelectorAll('.room-email').forEach(e => e.textContent = s.email || 'your Google account');
  for (const name of ['roomName', 'roomEmail', 'timeZone']) if (!dirtyForms.has('roomForm') && document.activeElement !== $(name)) $(name).value = s.settings[name] || '';
  $('disconnect').disabled = !s.calendar.connected || Boolean(s.active);

  $('calendarState').textContent = s.calendar.error ? 'Needs attention' : s.calendar.connected ? 'Connected' : 'Not connected';
  $('calendarDetail').textContent = s.calendar.error || (s.calendar.lastSync ? `Last synced ${time(s.calendar.lastSync)} · Refreshes every 30 seconds` : 'Connect the room’s Google Calendar.');
  $('browserState').textContent = s.browser.error ? 'Needs attention' : s.browser.verified ? (s.browser.running ? 'Ready' : 'Starting') : 'Sign-in needed';
  $('browserDetail').textContent = s.browser.error || (s.browser.verified ? 'Dedicated Portal Chrome profile.' : 'Sign in once with the Portal room account.');
  const ready = Boolean(s.health?.healthy);
  $('mainState').textContent = s.active ? 'The room is in a meeting.' : s.settings.paused ? 'Taking a pause.' : ready ? 'Ready for the next meeting.' : 'Let’s connect your room.';
  if (s.active && s.active.phase !== 'in-call') $('mainState').textContent = 'Getting the room into the meeting.';
  if (s.active?.phase === 'leaving') $('mainState').textContent = 'Leaving the meeting.';
  if (!s.active && s.browser.error) $('mainState').textContent = 'The room needs attention.';
  $('autoBadge').textContent = s.settings.paused ? 'PAUSED' : ready ? (s.fresh ? 'AUTOMATIC' : 'WAITING FOR SYNC') : 'SETUP';
  $('autoBadge').classList.toggle('on', ready && !s.settings.paused && s.fresh);
  $('message').textContent = s.message;
  $('agentToggle').disabled = !s.agent;
  $('agentToggle').textContent = s.agent?.enabled ? 'Disable agent access' : 'Enable agent access';
  $('agentCopy').disabled = !s.agent?.enabled;
  $('agentRotate').disabled = !s.agent?.enabled;
  $('agentDetail').textContent = !s.agent ? 'Run setup.command to install agent controls.' : s.agent.enabled ? 'Agent commands are enabled on this Mac. Remote connectivity is configured separately.' : 'Agent access is off.';
  $('pause').textContent = s.settings.paused ? 'Resume auto-join' : 'Pause auto-join';
  $('connect').disabled = !s.calendar.hasClient;
  $('connect').textContent = s.calendar.connected ? 'Reconnect Google Calendar' : 'Connect Google Calendar';
  $('verify').disabled = !s.browser.running;
  $('active').hidden = !s.active;
  if (s.active) {
    $('activeTitle').textContent = s.active.title;
    const count = s.active.attendance?.count;
    const participants = s.active.phase === 'in-call' ? (count != null ? ` · ${count} participant${count === 1 ? '' : 's'}` : ' · Participant count unavailable') : '';
    const media = s.active.mediaObserved ? ` · Camera ${s.active.mediaObserved.camera} · Mic ${s.active.mediaObserved.microphone}` : '';
    $('activeEnd').textContent = `${s.active.source === 'drop-in' ? 'Drop-in room' : `Scheduled end ${time(s.active.end)}`} · ${s.active.phase.replaceAll('-', ' ')}${participants}${media}`;
    $('extend').hidden = s.active.source === 'drop-in';
  }
  const departureSupported = Number.isInteger(s.settings.aloneLeaveSeconds);
  $('saveDeparture').disabled = !departureSupported;
  if (!dirtyForms.has('departureForm') && document.activeElement !== $('aloneLeaveSeconds')) $('aloneLeaveSeconds').value = String(s.settings.aloneLeaveSeconds ?? 60);
  $('departureDetail').textContent = !departureSupported ? 'Run setup.command once to activate this update.' : s.settings.aloneLeaveSeconds ? `Scheduled meetings leave after ${s.settings.aloneLeaveSeconds} seconds alone, once another participant has been seen. Someone returning cancels the countdown. The scheduled end still applies.` : 'Leaving scheduled meetings when alone is off. The scheduled end still applies.';
  if (!dirtyForms.has('dashboardForm') && document.activeElement !== $('dashboard')) $('dashboard').value = s.settings.dashboard;
  const dropInSupported = typeof s.settings.dropInEnabled === 'boolean';
  $('saveDropIn').disabled = !dropInSupported;
  $('connectMeet').disabled = !dropInSupported || !s.calendar.hasClient;
  if (!dropInDirty) {
    $('dropInUrl').value = s.settings.dropInUrl || '';
    $('dropInEnabled').checked = s.settings.dropInEnabled || false;
  }
  $('dropInDetail').textContent = !dropInSupported ? 'Run setup.command once to activate this update.' : s.dropIn?.error ? s.dropIn.error : !s.dropIn?.connected ? 'Google Meet monitoring needs a one-time Google connection.' : !s.settings.dropInEnabled ? 'Connected. Drop-in monitoring is off.' : s.settings.paused ? 'Drop-in monitoring is paused.' : s.dropIn?.checkedAt ? `Monitoring every five seconds · ${s.dropIn.others || 0} visitor(s) · Last checked ${time(s.dropIn.checkedAt)}` : 'Waiting for the first room check.';
  if (s.dropIn?.leaveAfterSeconds && s.settings.dropInEnabled) $('dropInDetail').textContent += ` · Closes the meeting tab ${s.dropIn.leaveAfterSeconds} seconds after the last visitor leaves. Your dashboard stays open.`;
  $('retryDropIn').hidden = Boolean(s.active || !s.settings.dropInEnabled || !(s.dropIn?.others > 0));
  $('retryDropIn').disabled = busy || s.settings.paused || !s.browser.verified || !s.fresh || Boolean(s.dropIn?.error);
  $('meetings').replaceChildren();
  if (!s.events.length) { const p = document.createElement('p'); p.className = 'empty'; p.textContent = s.calendar.connected ? 'No eligible Google Meet invitations in the next 48 hours.' : 'Your invited Google Meet meetings will appear here.'; $('meetings').append(p); }
  for (const event of s.events.slice(0, 8)) {
    const row = document.createElement('div'); row.className = 'meeting';
    const when = document.createElement('span'); when.className = 'meeting-time'; when.textContent = dateTime(event.start);
    const detail = document.createElement('div'); const title = document.createElement('strong'); title.textContent = event.title; const sub = document.createElement('p'); sub.textContent = `${time(event.end)} end · ${event.organizer}`; detail.append(title, sub); row.append(when, detail); $('meetings').append(row);
    if (!s.active && event.start <= Date.now() && event.end > Date.now()) {
      const label = document.createElement('label'); const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = testWithoutDevices.has(event.id);
      checkbox.onchange = () => checkbox.checked ? testWithoutDevices.add(event.id) : testWithoutDevices.delete(event.id);
      label.append(checkbox, document.createTextNode(' Test this meeting with camera and microphone off'));
      const retry = document.createElement('button'); retry.textContent = `Retry join: ${event.title}`; retry.disabled = busy || !s.browser.verified || !s.fresh;
      retry.onclick = () => { const allowMissingDevices = testWithoutDevices.has(event.id); testWithoutDevices.delete(event.id); action('retry', {id: event.id, allowMissingDevices}); };
      detail.append(label, retry);
    }
  }
  $('activity').replaceChildren();
  for (const item of s.activity.slice(0, 6)) { const p = document.createElement('p'); const t = document.createElement('span'); t.textContent = time(item.at); p.append(t, document.createTextNode(item.text)); $('activity').append(p); }
  if (!s.activity.length) { const p = document.createElement('p'); p.className = 'empty'; p.textContent = 'Waiting for your first connection.'; $('activity').append(p); }
  document.dispatchEvent(new CustomEvent('portal:state', {detail:s}));
}
async function action(name, body = {}, form) {
  if (busy) return false;
  busy = true;
  try { const s = await api(name, body); if (form) dirtyForms.delete(form); render(s); $('toast').hidden = true; document.dispatchEvent(new CustomEvent('portal:action', {detail:{name}})); return true; }
  catch (e) { toast(e.message, true); return false; }
  finally { busy = false; }
}
$('roomForm').onsubmit = event => { event.preventDefault(); action('room', {roomName: $('roomName').value, roomEmail: $('roomEmail').value, timeZone: $('timeZone').value}, 'roomForm'); };
$('disconnect').onclick = () => action('disconnect');
$('pause').onclick = () => action('settings', {paused: !state?.settings.paused});
$('refresh').onclick = () => action('sync');
$('openBrowser').onclick = () => action('browser');
$('retryDropIn').onclick = () => action('drop-in-retry');
$('signIn').onclick = () => action('signin');
$('verify').onclick = () => action('verify');
$('leave').onclick = () => action('leave');
$('extend').onclick = () => action('extend');
$('agentToggle').onclick = () => action('agent-access', {enabled: !state?.agent?.enabled});
async function copyAgentToken(rotate = false) {
  if (busy) return;
  busy = true;
  try {
    const result = await api('agent-token', {rotate});
    await navigator.clipboard.writeText(result.token);
    toast(rotate ? 'New token copied. The previous token is revoked. Save the new one in your agent’s secret store.' : 'Agent token copied. Save it in your agent’s secret store.');
  } catch (error) { toast(error.message, true); }
  finally { busy = false; }
}
$('agentCopy').onclick = () => copyAgentToken();
$('agentRotate').onclick = () => copyAgentToken(true);
$('dashboardForm').onsubmit = event => { event.preventDefault(); action('settings', {dashboard: $('dashboard').value.trim()}, 'dashboardForm'); };
$('departureForm').onsubmit = event => { event.preventDefault(); action('settings', {aloneLeaveSeconds: Number($('aloneLeaveSeconds').value)}, 'departureForm'); };
let dropInDirty = false;
$('dropInForm').oninput = () => { dropInDirty = true; };
$('dropInForm').onsubmit = async event => {
  event.preventDefault();
  if (busy) return;
  busy = true;
  try {
    const result = await api('drop-in', {url: $('dropInUrl').value.trim(), enabled: $('dropInEnabled').checked, accessConfirmed: $('dropInAccess').checked});
    dropInDirty = false; $('dropInAccess').checked = false; render(result); $('toast').hidden = true; document.dispatchEvent(new CustomEvent('portal:action', {detail:{name:'drop-in'}}));
  } catch (e) { toast(e.message, true); }
  finally { busy = false; }
};
$('clientFile').onchange = async event => {
  const file = event.target.files[0]; if (!file) return;
  try { if (file.size > 100_000) throw new Error('Choose the small OAuth client JSON file.'); const parsed = JSON.parse(await file.text()); await action('client', parsed); }
  catch (e) { toast(`Cannot import this file: ${e.message}`, true); }
  finally { event.target.value = ''; }
};
async function connectGoogle(meet = false) {
  // Open directly from the click so browser popup protection does not block OAuth.
  const tab = window.open('about:blank', '_blank');
  try { const result = await api('connect', {meet}); if (tab) { tab.opener = null; tab.location = result.url; } else location.href = result.url; }
  catch (e) { tab?.close(); toast(e.message, true); }
}
$('connect').onclick = () => connectGoogle();
$('connectMeet').onclick = () => connectGoogle(true);
let connectionError = false;
async function refresh() {
  if (!key || busy) return;
  try { render(await api('status')); if (connectionError) $('toast').hidden = true; connectionError = false; }
  catch (e) { connectionError = true; toast(e instanceof TypeError ? 'Controller offline. Run setup.command to start it, then use Open Portal.command.' : e.message, true); }
}
if (!key) { $('locked').hidden = false; document.querySelectorAll('button,input').forEach(e => e.disabled = true); }
else { refresh(); setInterval(refresh, 4000); }
