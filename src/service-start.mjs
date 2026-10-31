const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// launchd can briefly reject registration while an unloaded job is cleaning up.
// Retry only bootstrap's generic I/O error; never change disabled-service policy.
export async function startService({launch, domain, label, plist, wait = delay}) {
  const target = `${domain}/${label}`;
  const failures = [];
  for (let attempt = 0; attempt < 4; attempt++) {
    const loaded = launch('bootstrap', domain, plist);
    if (loaded.status === 0) return;
    failures.push((loaded.stderr || loaded.error?.message || `exit ${loaded.status}`).trim());
    // A registration may have succeeded despite the command returning an error.
    // This is our exact service label, never an unrelated startup item.
    if (launch('print', target).status === 0) {
      const started = launch('kickstart', target);
      if (started.status === 0) return;
      throw new Error(`Portal is registered but could not start: ${(started.stderr || started.error?.message || `exit ${started.status}`).trim()}`);
    }
    if (loaded.status !== 5 || attempt === 3) break;
    await wait(1000 * (attempt + 1));
  }
  throw new Error(`Portal startup failed after ${failures.length} attempt(s): ${failures.join(' | ')}`);
}
