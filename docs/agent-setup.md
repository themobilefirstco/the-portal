# Set up with an agent

Clone this repository directly, or fork if you want to contribute changes. A fork is not required to run The Portal. Use a dedicated Mac login and Google room account.

```sh
bash setup.command --non-interactive --no-open
runtime/node scripts/doctor.mjs
```

The installer still runs its source checks and full test suite. Add `--skip-tests` only for a build you have already validated. `--no-open` suppresses the setup browser. `--non-interactive` applies only to this installer process: its Keychain helper does not request interactive authorization. That setting is not written into the login service, so later Keychain writes from the running controller can prompt normally. The next setup rewrites the service definition without `PORTAL_NON_INTERACTIVE`, including when this flag is used. It cannot bypass a locked Keychain, Apple developer-tool installation, Google consent or macOS permissions. Bootstrap may require developer tools to have been installed beforehand. If Keychain access is blocked, stop and give the owner the [human checklist](human-only-checklist.md). A non-interactive installation may fail readiness until the owner has authorized the helper; it does not claim a working room.

## Apply configuration

Save private configuration outside the checkout. [The schema](../config.schema.json) rejects unknown fields and disallows inline tokens or client secrets. Example:

```json
{
  "room": {"roomName":"Studio", "roomEmail":"room@example.com", "timeZone":"America/New_York"},
  "googleClientFile":"./private-google-desktop-client.json",
  "settings": {"paused":true, "aloneLeaveSeconds":60}
}
```

```sh
runtime/node scripts/apply-config.mjs --file /private/path/room.json
```

The client file path is relative to the config file. Importing it does **not** grant OAuth consent. Remove `googleClientFile` from subsequent runs once connected. Changes go through the exact local endpoints used by room controls, including active-call guards, Google validation and drop-in access checks. No direct edits to live state are made. Operations apply in order: room, client, drop-in, branded URL, settings. This is **not a transaction**: on failure, JSON lists applied operations; fix the failure and retry the remaining sections. A connected account cannot be silently replaced.

After a human configures access rules for the dedicated Meet room, a second configuration can contain:

```json
{
  "dropIn":{"enabled":true,"url":"https://meet.google.com/abc-defg-hij","accessConfirmed":true},
  "brandedUrl":"https://meet.example.com/studio",
  "settings":{"paused":false}
}
```

These are placeholders. `accessConfirmed` must reflect the owner's actual confirmation. The controller verifies the room through Google. Saving a branded URL does not publish DNS or deploy hosting; follow [the branded URL guide](branded-room-url.md). Manual device, call and redirect confirmations stay in the guided UI, after the owner has performed them. Never set these by editing the state file.

## One-time local agent bootstrap

With the owner's permission to give an agent room control, run:

```sh
runtime/node scripts/bootstrap-agent.mjs --token-file /private/path/portal-token
```

The command uses the existing control credential from Keychain to enable the optional loopback API. It writes the bearer token to a new owner-only file and never prints it. It refuses to overwrite a file or follow a symlink. Keep this file outside git and pass its contents only to the authorized local client. No new remote settings endpoint is exposed. If bootstrap fails after enabling access, inspect room controls; access can be disabled there and the token can be rotated. [Runtime API and security boundaries](agent-api.md).

## Health and removal

`runtime/node scripts/doctor.mjs` prints JSON only and exits 0 for ready, 1 for human/setup work, 2 for an operational failure. Health is a snapshot, not a guarantee that a future meeting will work. The report deliberately omits tokens, account emails and meeting URLs. An idle room cannot automatically verify speaker quality or camera framing.

```sh
runtime/node src/install.mjs --uninstall
```

Uninstall stops the service, disables login startup and removes the installed application copy. It preserves state, Chrome profile, logs and Keychain credentials for recovery. `--stop` keeps the app copy too. Neither command deletes the source checkout. Do not run either during an active call.
