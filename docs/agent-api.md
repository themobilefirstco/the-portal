# Optional private agent API

Agent access is off by default. Enable it in authenticated room controls and copy its separate bearer token into your agent's secret store. It listens only on `127.0.0.1:4281`. A private authenticated tunnel is a separate operator decision; do not expose it or Chrome's debugging endpoint publicly.

All endpoints require `Authorization: Bearer <token>`. Browser-origin requests are rejected; this is not a CORS API. Requests are limited to 120 per minute after authentication. Rotate or disable the token from room controls. Revocation is checked again before a queued command executes.

| Method and path | Result |
| --- | --- |
| `GET /v1/status` | Room state, health, current call ID, recent activity. |
| `GET /v1/health` | 200 if healthy, 503 if dependencies need attention. Idle devices are untested. |
| `POST /v1/join` | Accept `{ "url": "https://meet.google.com/abc-defg-hij", "durationMinutes": 60, "title": "Call" }`. Duration: 5–180 minutes. |
| `POST /v1/leave` | Accept `{ "callId": "the exact active ID from status" }`. Stale IDs are rejected. |
| `GET /v1/requests/REQUEST_ID` | Outcome of a submitted command. |

POST requests need `Content-Type: application/json` and an `Idempotency-Key` of 8–128 letters, digits, underscores or hyphens. Reusing a key with different input returns 409; retrying the same command does not run it twice. Up to 500 command records are retained with seven-day replay protection; a full protected history returns 429 rather than discarding protection.

202 means accepted, **not joined**. Poll the request: `joined` requires an observed call and initial media controls confirmed on; failures remain distinct. Startup interrupts unresolved accepted requests rather than replaying them.

An agent cannot replace an active call, bypass pause, use a non-Meet URL, change accounts, turn on device-free test mode or administer the Mac. Scheduled calls take priority. Leave requires the exact current call identity. The caller's possession of this token permits activating room media, so keep it scoped and private.

Machine-readable contract: [OpenAPI](openapi.json). For installation and one-time local bootstrap, see [agent setup](agent-setup.md). Configuration is deliberately kept off the bearer API.
