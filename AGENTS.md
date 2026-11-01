# The Portal: agent entry point

Local macOS room controller, Google accounts and Google Meet only. This is a source preview, not a signed native app. Requires a logged-in graphical Mac session, Chrome, internet and real room devices. Cloning is enough; forking is optional.

## Install and configure

1. Read [agent setup](docs/agent-setup.md) and [human checklist](docs/human-only-checklist.md).
2. `bash setup.command --non-interactive --no-open` bootstraps pinned dependencies, tests and installs. `--skip-tests` is an explicit opt-out for already-tested builds. Never report tests passed when skipped.
3. `runtime/node scripts/apply-config.mjs --file /private/path/room.json` uses [config.schema.json](config.schema.json) and the same authenticated local endpoints as the GUI. Apply is ordered, not transactional: inspect the returned `applied` list on failure.
4. `runtime/node scripts/doctor.mjs` emits JSON: 0 healthy, 1 human action needed, 2 operational/configuration error. It never opens a browser or prompts for Keychain access.
5. Hand Google OAuth, Chrome sign-in, Keychain authorization, microphone/camera permissions and a real call test to the owner. Never simulate consent or mark untested devices verified.
6. With owner authorization, bootstrap optional bearer controls as described in [agent setup](docs/agent-setup.md). Runtime API: [agent-api.md](docs/agent-api.md).

Default loopback ports: control 4280; optional bearer API 4281. Do not expose either publicly. Chrome debugging is private loopback on a dynamically allocated port. Logs: `~/Library/Application Support/The Portal/controller.log` and `controller-error.log`; state: `~/Library/Application Support/The Portal/state`. Secrets live in macOS Keychain; never commit OAuth JSON, tokens, profiles, private room configuration or logs.

## Contributor checks

Use the pinned `runtime/node`. Run `runtime/node scripts/check.mjs` and `runtime/node scripts/test.mjs`. `--unit` excludes real Chrome fixtures and is not equivalent to the full suite. Keep Google-only boundaries and authentication checks. Test with synthetic accounts; never change a live room for a test. No real Meet acceptance claim without the owner's hardware test.
