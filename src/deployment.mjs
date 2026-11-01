import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export async function deploy({source, destination, stop, start, verify, entries, restore = async () => {}}) {
  const parent = path.dirname(destination);
  fs.mkdirSync(parent, {recursive: true, mode: 0o700});
  const staging = path.join(parent, `.stage-${crypto.randomUUID()}`);
  const previous = path.join(parent, `.previous-${crypto.randomUUID()}`);
  let moved = false, installed = false;
  try {
    fs.mkdirSync(staging, {mode: 0o700});
    for (const entry of entries) {
      fs.mkdirSync(path.dirname(path.join(staging, entry)), {recursive: true});
      fs.cpSync(path.join(source, entry), path.join(staging, entry), {recursive: true});
    }
    await stop();
    if (fs.existsSync(destination)) { fs.renameSync(destination, previous); moved = true; }
    fs.renameSync(staging, destination); installed = true;
    await start(); await verify();
    if (moved) fs.rmSync(previous, {recursive: true, force: true});
  } catch (error) {
    if (installed) {
      try { await stop(); }
      catch { throw new Error(`Update failed and the new service could not stop. Application files and any previous backup were preserved in ${parent}. Stop the service before recovery. Original error: ${error.message}`); }
      fs.rmSync(destination, {recursive: true, force: true});
    }
    if (moved) {
      fs.renameSync(previous, destination);
      try { await restore(); await start(); } catch { throw new Error(`Update failed; previous files restored but startup failed. Run setup again. Original error: ${error.message}`); }
    }
    throw error;
  } finally { fs.rmSync(staging, {recursive: true, force: true}); }
}
