import test from 'node:test';
import assert from 'node:assert/strict';
import {debugEndpoint, nativeChromeArguments, LocalBrowserConnection} from '../src/native-chrome.mjs';

test('native launch keeps the room profile isolated and debugger on random loopback', () => {
  const args = nativeChromeArguments('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/private/room profile', 'Profile 1');
  assert.deepEqual(args.slice(0, 4), ['-n', '-a', '/Applications/Google Chrome.app', '--args']);
  assert.ok(args.includes('--user-data-dir=/private/room profile'));
  assert.ok(args.includes('--profile-directory=Profile 1'));
  assert.ok(args.includes('--remote-debugging-address=127.0.0.1'));
  assert.ok(args.includes('--remote-debugging-port=0'));
  assert.ok(!args.some(arg => /no-sandbox|fake|allow-origins|use-fake-ui/.test(arg)));
});
test('browser endpoint accepts only the private file format and fixes the host to loopback', () => {
  const route = '/devtools/browser/12345678-abcd-1234-abcd-123456789012';
  assert.equal(debugEndpoint(`50123\n${route}\n`), `ws://127.0.0.1:50123${route}`);
  for (const input of [`80\n${route}`, `99999\n${route}`, `50000\n//evil.example/x`, `50000\n${route}\nextra`, `50000\n${route}?token=x`, `0x9999\n${route}`]) {
    assert.throws(() => debugEndpoint(input));
  }
});
class Socket extends EventTarget {
  readyState = 1;
  sent = [];
  send(data) { this.sent.push(JSON.parse(data)); }
  reply(value) { this.dispatchEvent(new MessageEvent('message', {data: JSON.stringify(value)})); }
  close() { this.readyState = 3; this.dispatchEvent(new Event('close')); }
}
test('local connection correlates out-of-order Unicode responses and rejects protocol errors', async () => {
  const socket = new Socket(), connection = new LocalBrowserConnection(socket);
  const first = connection.send('One', {text: 'Portal 🌴'}, 'owned-session');
  const second = connection.send('Two');
  assert.equal(socket.sent[0].sessionId, 'owned-session');
  assert.equal(socket.sent[0].params.text, 'Portal 🌴');
  socket.reply({id: 2, result: {text: 'Jérémy'}});
  socket.reply({id: 1, result: {ok: true}});
  assert.deepEqual(await first, {ok: true}); assert.deepEqual(await second, {text: 'Jérémy'});
  const failed = assert.rejects(connection.send('Fail'), /refused/);
  socket.reply({id: 3, error: {message: 'refused'}}); await failed;
  assert.equal(connection.pending.size, 0); socket.close();
});
test('disconnect rejects outstanding work and marks the exact connection closed', async () => {
  const socket = new Socket(); let closed;
  const connection = new LocalBrowserConnection(socket, value => { closed = value; });
  const pending = assert.rejects(connection.send('Pending'), /closed/);
  socket.close(); await pending;
  assert.equal(connection.running, false); assert.equal(closed, connection);
  await assert.rejects(connection.send('No connection'), /not connected/);
});
test('stop waits for actual disconnection after the close response', async () => {
  const socket = new Socket(), connection = new LocalBrowserConnection(socket);
  let done = false; const stopping = connection.stop().then(() => { done = true; });
  assert.equal(socket.sent[0].method, 'Browser.close');
  socket.reply({id: 1, result: {}});
  await Promise.resolve(); assert.equal(done, false);
  socket.close(); await stopping; assert.equal(done, true);
});
test('a synchronous transport write failure does not leak pending requests', async () => {
  const socket = new Socket(), connection = new LocalBrowserConnection(socket);
  socket.send = () => { throw new Error('write failed'); };
  await assert.rejects(connection.send('Fail'), /write failed/);
  assert.equal(connection.pending.size, 0); socket.close();
});
