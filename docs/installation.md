# Install and operate The Portal

The preview is installed from source with `./setup.command`. It uses a per-user macOS LaunchAgent, not a root service. Do not run setup with `sudo`.

## What setup does

1. Confirms macOS and Apple Command Line Tools are available.
2. Downloads Node **24.22.2** from nodejs.org for the current Mac architecture and compares its archive against a pinned SHA-256. The runtime and license stay under ignored `runtime/` in the checkout.
3. Compiles the small Swift Keychain helper using Apple's compiler and applies an ad-hoc identity for this source build.
4. Runs all tests, including a temporary headless Chrome fixture. Any failed check stops installation.
5. Stages the complete app before stopping an existing service. Active calls and unauthenticated controller responses block an update.
6. Replaces application files, starts the user service, and checks the application version and scheduler heartbeat. Failed activation attempts to stop the new service, restore the previous files and restart them. If stopping fails, both installations are preserved and setup reports a recovery error.
7. Opens the authenticated room controls in your browser.

An unsigned source build is not a notarized app download. macOS Keychain may request permission for the helper; verify the path belongs to your checkout or installed Portal app. Rebuilding the helper can cause another prompt. A future Developer ID-signed release should use a stable signing identity.

## Installed locations

| Item | Location |
| --- | --- |
| App and runtime | `~/Library/Application Support/The Portal/app` |
| Settings, history, isolated Chrome profile | `~/Library/Application Support/The Portal/state` |
| User startup | `~/Library/LaunchAgents/org.theportal.room.plist` |
| Credentials | macOS login Keychain, service prefix `org.theportal.room.` |
| Service logs | `~/Library/Application Support/The Portal/controller.log` and `controller-error.log` |
| Room controls | `http://127.0.0.1:4280`, opened with a private key by `Open Portal.command` |
| Optional agent API | `http://127.0.0.1:4281`, disabled by default |

Credentials never belong in the checkout. Portal state is also outside the checkout, so changing branches does not replace the browser profile or tokens. Treat state and diagnostic logs as private; they can include meeting titles, account identifiers and URLs. Activity history is bounded to 200 entries. Service logs should be inspected/rotated by the operator if unusually verbose; do not attach them publicly without review.

The installed service uses the standard paths and ports above. Advanced foreground development can override `PORTAL_DATA_DIR`, `PORTAL_PORT`, `PORTAL_AGENT_PORT` or `PORTAL_CHROME`. Use a separate directory, ports and test account. The normal installer does not install custom-port services.

## Updates and stopping

Leave any call, fetch a reviewed version into your fork, and run setup again. Tests run before the service is touched. State format migrations must remain backward compatible with the previous release for rollback; this first public version has no destructive migration.

If setup reports that the new service could not stop, do not delete its application files or `.previous-*` backup. Leave the call, stop the service successfully, and preserve the backup while investigating the error. A subsequent setup does not automatically select an older backup from an interrupted attempt.

Run `Stop Portal.command` to stop the service and remove its login startup item. It preserves state and credentials. It closes the owned room Chrome instance when the controller shuts down. Re-run setup to reinstall/start it.

To remove the account, first use **Disconnect Google access** in controls while online. This revokes API tokens and pauses the room. Sign out of the separate room browser as well. Then stop Portal. If removing the installation completely, delete its Application Support folder and its `org.theportal.room.*` generic-password items in Keychain Access after confirming you no longer need them. Removing files without revoking access does not revoke a Google grant; you can also remove it from your Google Account's third-party connections page.

## Unattended operation

The service starts after this macOS user logs in. FileVault unlock, automatic login, power-return behavior, TV power/input, sleep/lock and USB devices are separate system concerns. The app uses `caffeinate` while running to prevent idle sleep; it does not override a deliberate lock, logout, manual sleep or power loss. Do not change FileVault or automatic login based only on the fact that the controller is installed.

Complete a controlled reboot/login test and an overnight test. Verify the actual TV output and speaker routing. The room currently maximizes its Chrome window rather than selecting a named monitor. Multi-display placement and automatic device reselection need manual verification.

Tailscale or screen sharing can help with maintenance, but is not required for normal use. Never forward Chrome's debugging endpoint. The optional agent API has its own bearer token and must be kept on a private authenticated path.

## Coexistence with another room controller

Do not run two controllers against the same browser profile or ports. Keep an existing production room unchanged until the new installation passes its acceptance test. The Portal uses its own app name, service label and data directory; it does not automatically import another installation's tokens, history or browser cookies.
