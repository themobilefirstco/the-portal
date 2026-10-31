// Executed only inside the controller's own Chrome target. Unknown UI is never clicked.
export function inspectMeet({email, act = false, verified = false, allowMissingDevices = false, ensureInitialMedia = false, mediaAttempts = {}}) {
  const visible = e => Boolean(e.getClientRects().length) && getComputedStyle(e).visibility !== 'hidden';
  const buttons = [...document.querySelectorAll('button,[role="button"]')].filter(visible);
  const label = e => (e.getAttribute('aria-label') || e.innerText || '').replace(/\s+/g, ' ').trim();
  const button = re => buttons.find(e => re.test(label(e)) && !e.disabled && e.getAttribute('aria-disabled') !== 'true');
  const body = document.body?.innerText || '';
  const micOff = button(/^Turn on microphone\b/i), micOn = button(/^Turn off microphone\b/i);
  const camOff = button(/^Turn on camera\b/i), camOn = button(/^Turn off camera\b/i);
  const micProblem = button(/^Microphone problem\b/i), camProblem = button(/^Camera problem\b/i);
  const deviceState = (on, off, problem) => problem ? 'unavailable' : Boolean(on) === Boolean(off) ? 'unknown' : on ? 'on' : 'off';
  const media = {microphone: deviceState(micOn, micOff, micProblem), camera: deviceState(camOn, camOff, camProblem)};
  const leave = button(/^(Leave call|Leave meeting)(\b|$)/i);
  if (leave) {
    const mediaActions = [];
    // Repair a Google auto-mute only during initial entry, at most once per device.
    // Once startup is verified the controller never overrides in-call mute choices.
    if (act && ensureInitialMedia && !allowMissingDevices) {
      if (media.microphone === 'off' && !mediaAttempts.microphone) { micOff.click(); mediaActions.push('microphone'); }
      if (media.camera === 'off' && !mediaAttempts.camera) { camOff.click(); mediaActions.push('camera'); }
    }
    // Read only the People control, never video tiles, chat text or page-wide numbers.
    const counts = new Set();
    const add = value => { const n = Number(value); if (Number.isSafeInteger(n) && n >= 1 && n <= 10_000) counts.add(n); };
    for (const control of buttons.filter(e => /^(Show everyone|People|Participants)(?:$|[\s(:])/i.test(label(e)))) {
      const labelled = label(control).match(/^(?:Show everyone|People|Participants)\s*[:,(]?\s*(\d+)\s*\)?$/i);
      if (labelled) add(labelled[1]);
      let node = control;
      for (let depth = 0; node && depth < 3; depth++, node = node.parentElement) {
        if (node !== control) {
          const siblings = [...node.querySelectorAll('button,[role="button"]')].filter(visible);
          if (siblings.length !== 1 || siblings[0] !== control) break;
        }
        const text = (node.innerText || '').replace(/Show everyone|Participants|people_alt|People|group/gi, '').trim();
        if (/^\d+$/.test(text)) add(text);
      }
    }
    return {state: 'in-call', participantCount: counts.size === 1 ? [...counts][0] : null, media, mediaActions};
  }
  if (/You can.t join this video call/i.test(body)) return {state: 'access-denied', message: 'Google Meet says: You can’t join this video call. Check the room Chrome account and the host’s access settings, then retry.'};
  if (/You left the meeting|You’ve left the meeting|You've left the meeting|You were removed|The meeting has ended/i.test(body)) return {state: 'ended'};
  if (/Asking to be let in|Someone will let you in|Waiting for the host|waiting room|Waiting to be admitted/i.test(body)) return {state: 'waiting', message: 'Waiting for the meeting host to admit the room.'};
  const join = button(allowMissingDevices ? /^(Join now|Ask to join|Join meeting|Join now without microphone & camera)$/i : /^(Join now|Ask to join|Join meeting)$/i);
  if (!join) return {state: 'loading', verified, message: 'Waiting for the Google Meet preview. Sign in if Google asks.'};
  if (!verified) return {state: 'account-required', message: `Sign in to the room Chrome profile as ${email}. The room account could not be verified on this page.`};
  const missingMic = /Microphone not found|Mic not found/i.test(body);
  const missingCamera = /Camera not found/i.test(body);
  if (allowMissingDevices) {
    // This applies to one explicitly requested test, never future automatic joins.
    if (act && micOn) micOn.click();
    if (act && camOn) camOn.click();
    if (micOn || camOn) return {state: 'devices-disabling', message: 'Turning camera and microphone off for this test.'};
    if ((!micOff && !missingMic) || (!camOff && !missingCamera)) return {state: 'devices-required', message: 'Waiting to confirm camera and microphone are off for this test.'};
    if (act) { join.click(); return {state: 'joining'}; }
    return {state: 'ready', verified: true};
  }
  if (missingMic || missingCamera || micProblem || camProblem) return {state: 'devices-required', media, message: 'Google Meet cannot use the camera or microphone. Check your room devices and device permissions. The room has not joined.'};
  if (act && micOff) micOff.click();
  if (act && camOff) camOff.click();
  if (media.microphone !== 'on' || media.camera !== 'on') return {state: 'devices-required', media, message: 'Waiting for camera and microphone access. Connect your room devices and allow permissions in Chrome.'};
  // Meet can label both toggles "on" while capture is still stuck starting.
  // Before joining, every video is a local preview; remote participants are absent.
  const cameraReady = [...document.querySelectorAll('video')].some(video => {
    if (!visible(video) || video.paused || video.readyState < 2 || !(video.videoWidth > 0) || !(video.videoHeight > 0)) return false;
    const tracks = video.srcObject?.getVideoTracks?.() || [];
    return tracks.some(track => track.readyState === 'live' && track.enabled && !track.muted);
  });
  if (/Camera is starting|Starting (?:your )?camera/i.test(body) || !cameraReady) return {state: 'devices-starting', media, cameraReady: false, message: 'Waiting for a live room camera image before joining. Device buttons alone do not confirm the camera has started.'};
  if (act) { join.click(); return {state: 'joining'}; }
  return {state: 'ready', verified: true};
}

export function leaveMeet() {
  const button = [...document.querySelectorAll('button,[role="button"]')].find(e => e.getClientRects().length && /^(Leave call|Leave meeting)(\b|$)/i.test(e.getAttribute('aria-label') || e.innerText || ''));
  if (button) button.click();
  return Boolean(button);
}

export function inspectAccount(email) {
  const visible = e => Boolean(e.getClientRects().length) && getComputedStyle(e).visibility !== 'hidden';
  if (typeof email !== 'string' || !email.trim()) return false;
  const account = email.toLowerCase();
  const containsAccount = value => (value.toLowerCase().match(/[a-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-z0-9.-]+/g) || []).includes(account);
  if ([...document.querySelectorAll('[aria-label*="Google Account"],[aria-label*="Google account"],a[href*="accounts.google.com/SignOutOptions"]')].filter(visible).some(e => containsAccount(`${e.getAttribute('aria-label') || ''} ${e.getAttribute('title') || ''} ${e.innerText || ''}`))) return true;
  // Meet's current preview shows the signed-in email immediately above Switch account.
  const switchAccount = [...document.querySelectorAll('a[href*="accounts.google.com/AccountChooser"]')].find(e => visible(e) && e.innerText.trim() === 'Switch account');
  if (!switchAccount) return false;
  const lines = (document.body?.innerText || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const index = lines.indexOf('Switch account');
  return index > 0 && lines[index - 1].toLowerCase() === account;
}
