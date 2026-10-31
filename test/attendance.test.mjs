import test from 'node:test';
import assert from 'node:assert/strict';
import {trackAttendance} from '../src/attendance.mjs';
const step = (previous, now, count, extra = {}) => trackAttendance(previous, {now, count, ...extra});

test('the first arrival waits; being alone is not evidence that others have left', () => {
  let state;
  for (let now = 0; now <= 10*60_000; now += 3000) state = step(state, now, 1);
  assert.equal(state.sawOthers, false); assert.equal(state.leave, false); assert.equal(state.deadline, null);
});
test('leaves only after a continuous minute alone following other participants', () => {
  let state = step(undefined, 0, 3);
  state = step(state, 3000, 1);
  for (let now = 6000; now < 63000; now += 3000) { state = step(state, now, 1); assert.equal(state.leave, false); }
  assert.equal(step(state, 63000, 1).leave, true);
});
test('a returning participant cancels the old countdown', () => {
  let state = step(undefined, 0, 2);
  for (let now = 3000; now <= 57000; now += 3000) state = step(state, now, 1);
  state = step(state, 60000, 2); assert.equal(state.deadline, null);
  state = step(state, 63000, 1); assert.equal(state.deadline, 123000); assert.equal(state.leave, false);
});
test('unreadable counts, lost call state and polling gaps restart the countdown', () => {
  for (const bad of [null, undefined, 0, -1, 1.5, '1', 10001]) {
    let state = step(undefined, 0, 2);
    for (let now = 3000; now <= 57000; now += 3000) state = step(state, now, 1);
    state = step(state, 60000, bad); assert.equal(state.deadline, null);
    assert.equal(step(state, 63000, 1).deadline, 123000);
  }
  let state = step(step(undefined, 0, 2), 3000, 1);
  assert.equal(step(state, 63000, 1).deadline, 123000);
  state = step(state, 6000, 1, {inCall:false}); assert.equal(state.deadline, null);
});
test('supports the selected delay and disabling early departure', () => {
  for (const delayMs of [30000, 60000, 120000]) {
    let state = step(undefined, 0, 2, {delayMs});
    for (let now = 3000; now <= delayMs; now += 3000) state = step(state, now, 1, {delayMs});
    assert.equal(state.leave, false);
    assert.equal(step(state, delayMs + 3000, 1, {delayMs}).leave, true);
  }
  const disabled = step(step(undefined, 0, 2), 3000, 1, {delayMs:0});
  assert.equal(disabled.deadline, null); assert.equal(disabled.leave, false);
});
