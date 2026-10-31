export const DEFAULT_ALONE_LEAVE_SECONDS = 60;
export const ALONE_LEAVE_OPTIONS = [0, 30, 60, 120];

// Require continuous, fresh observations of the room being alone. A missing
// count or a long polling gap must never stand in for people leaving.
export function trackAttendance(previous = {}, {now, count, inCall = true, delayMs = 60_000}) {
  const valid = inCall && Number.isSafeInteger(count) && count >= 1 && count <= 10_000;
  const state = {sawOthers: Boolean(previous.sawOthers), count: valid ? count : null,
    aloneSince: null, lastObservedAt: now, deadline: null, leave: false};
  if (!valid) return state;
  if (count > 1) { state.sawOthers = true; return state; }
  if (!state.sawOthers || delayMs <= 0) return state;
  const continuous = Number.isFinite(previous.lastObservedAt) && now >= previous.lastObservedAt && now - previous.lastObservedAt <= 15_000;
  state.aloneSince = continuous && previous.count === 1 && previous.aloneSince != null ? previous.aloneSince : now;
  state.deadline = state.aloneSince + delayMs;
  state.leave = now >= state.deadline;
  return state;
}
