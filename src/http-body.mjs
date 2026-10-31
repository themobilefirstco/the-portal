// Decode after collecting bytes: UTF-8 characters may straddle network chunks.
export async function readJsonObject(req, limit = 100_000) {
  const chunks = []; let bytes = 0;
  for await (const part of req) {
    const chunk = Buffer.isBuffer(part) ? part : Buffer.from(part);
    bytes += chunk.length;
    if (bytes > limit) { const error = new Error('Request body is too large.'); error.status = 413; throw error; }
    chunks.push(chunk);
  }
  let value;
  try { value = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { const error = new Error('Send valid JSON.'); error.status = 400; throw error; }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    const error = new Error('Send a JSON object.'); error.status = 400; throw error;
  }
  return value;
}
