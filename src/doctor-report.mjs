export function doctorReport(status) {
  if (!status?.health || !Array.isArray(status.health.issues)) throw new Error('Invalid controller response');
  const issues = [...status.health.issues];
  if (!status.settings?.roomEmail) issues.push('room_not_configured');
  if (!status.settings?.setup?.devicesConfirmed || !status.settings?.setup?.visitConfirmed) issues.push('human_call_test_needed');
  const errors = new Set(['controller_stalled','calendar_stale','browser_error','drop_in_unavailable']);
  const exitCode = issues.some(issue => errors.has(issue)) ? 2 : issues.length ? 1 : 0;
  return {schemaVersion:1, healthy:exitCode === 0, exitCode, checks:[...new Set(issues)].map(code=>({code,status:errors.has(code)?'error':'needs_human'})), humanChecklist:'docs/human-only-checklist.md', deviceCheck:'Live microphone, speaker and camera quality require a human call test.'};
}
