import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {readJsonObject} from '../src/http-body.mjs';

test('JSON parsing preserves Unicode split at every byte boundary', async () => {
  const value={title:'Café 🌍 東京'},bytes=Buffer.from(JSON.stringify(value));
  for(let i=1;i<bytes.length;i++)assert.deepEqual(await readJsonObject(Readable.from([bytes.subarray(0,i),bytes.subarray(i)])),value);
});
test('JSON bodies reject non-objects, malformed input and oversized payloads', async () => {
  for(const text of ['null','[]','true','42','"string"','{',''])await assert.rejects(readJsonObject(Readable.from([text])),e=>e.status===400);
  await assert.rejects(readJsonObject(Readable.from(['{"value":"too long"}']),8),e=>e.status===413);
  assert.deepEqual(await readJsonObject(Readable.from(['{}']),2),{});
});
