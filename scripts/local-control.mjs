import {KeychainStore} from '../src/secrets.mjs';
import {DATA_DIR, portNumber} from '../src/config.mjs';

// Credentials never enter URLs, argv, environment variables, or reports.
export function localControl() {
  const token = new KeychainStore(DATA_DIR, {noPrompt:true}).read('control-key');
  if (!token) throw new Error('Run setup and complete the Keychain handoff first.');
  const origin = `http://127.0.0.1:${portNumber(process.env.PORTAL_PORT, 4280)}`;
  return async (route, body) => {
    const response = await fetch(`${origin}/api/${route}`, {
      method: body === undefined ? 'GET' : 'POST', redirect:'error',
      headers: {'x-room-token':token, 'content-type':'application/json'},
      ...(body === undefined ? {} : {body:JSON.stringify(body)}), signal:AbortSignal.timeout(30_000)
    });
    if (!response.ok) throw new Error(`Controller rejected ${route} (HTTP ${response.status}). Review room controls for the required handoff.`);
    return response.json();
  };
}
