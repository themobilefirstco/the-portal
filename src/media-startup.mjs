export const MEDIA_STARTUP_MS = 20_000;
export const MEDIA_STABLE_MS = 2000;

export function trackCaptureStartup(previous = {}, {now, state, wasInCall = false}) {
  if (wasInCall || state !== 'devices-starting') return {...previous, since: null, restart: false};
  const since = previous.since ?? now;
  const restart = !previous.attempted && now - since >= MEDIA_STARTUP_MS;
  return {since, attempted: Boolean(previous.attempted || restart), restart};
}

export function checkInitialMedia(previous, {now, media = {}, actions = [], allowMissingDevices = false}) {
  if (previous?.verified) return previous;
  const startedAt = previous?.startedAt ?? now;
  const attempts = {...previous?.attempts};
  for (const device of actions) if (['camera', 'microphone'].includes(device)) attempts[device] = (attempts[device] || 0) + 1;
  if (allowMissingDevices) return {startedAt, attempts, verified: true, test: true};
  const bothOn = media.camera === 'on' && media.microphone === 'on';
  const contiguous = previous?.lastObservedAt != null && now >= previous.lastObservedAt && now - previous.lastObservedAt <= 6000;
  const onSince = bothOn ? (contiguous && previous?.onSince != null ? previous.onSince : now) : null;
  const verified = bothOn && now - onSince >= MEDIA_STABLE_MS;
  return {startedAt, attempts, lastObservedAt: now, onSince, verified, failed: !verified && now - startedAt >= MEDIA_STARTUP_MS};
}
