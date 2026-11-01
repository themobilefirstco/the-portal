# The Portal

**Download the Mac app:** [unsigned preview releases](https://github.com/themobilefirstco/the-portal/releases) · [drag-and-drop installation guide](docs/mac-app.md). macOS 14+, Apple Silicon or Intel. The app includes its runtime; no Terminal or developer tools are needed. This preview is not notarized.

**Setting up with an agent?** Start with [AGENTS.md](AGENTS.md), [the configuration guide](docs/agent-setup.md), and [the human handoff checklist](docs/human-only-checklist.md). Cloning is enough; forking is optional.

Turn a Mac mini, a TV, and a camera into a Google Meet room.

![Illustrated Portal workflow: ready dashboard, visitor joins, Google Meet call, return to dashboard](docs/assets/portal-workflow.gif)

*An illustration of the workflow, not a live recording. See [what we have tested](docs/validation.md).*

[Get started](#set-up-your-own-room) · [Help build it](#help-us-build-the-best-portal) · [Contribution guide](CONTRIBUTING.md) · [Roadmap](docs/roadmap.md)

The Portal displays your dashboard between calls, joins Google Meet invitations sent to the room's Google account, and can open a dedicated drop-in meeting when someone joins. When the call ends, it returns to the same dashboard tab.

**Google Meet and Google accounts only.** No Gmail inbox access, Zoom, Teams, recording, transcription, or hosted account is required. Use an existing Google account with Calendar and Meet access; The Portal does not create an email account.

**Status: native unsigned preview, v0.2.0.** Downloadable Mac apps include the room controller and guided setup. Developer ID signing and notarization remain future work. Browser automation depends on Google's interface, and passing automated tests does not replace the [live acceptance checklist](docs/acceptance.md).

## What it does

- Joins timed Calendar invitations that explicitly include the configured room account.
- Opens camera and microphone for normal automatic joins, with a live local camera-preview check before entry. Respects manual mutes after startup.
- Detects real participants in a dedicated drop-in Meet room, plays an arrival chime, and opens the call.
- Leaves drop-ins after 15 seconds of confirmed guest absence; scheduled calls default to 60 seconds alone after a guest has been seen, or their scheduled end.
- Preserves your dashboard tab and its state. Each meeting gets a separate owned tab.
- Provides optional, disabled-by-default [private agent controls](docs/agent-api.md).
- Stores Google credentials and control tokens in macOS Keychain.

## Set up your own room

You need a Mac with a signed-in desktop session, Google Chrome, a Google account, internet access, and camera/microphone/speaker hardware. macOS 14 or newer is the initial target; Apple Silicon is the reference test platform. Intel runtime downloads are provided but hardware validation is still pending.

1. Download the matching **Apple Silicon or Intel DMG** from [releases](https://github.com/themobilefirstco/the-portal/releases). Drag **The Portal** into Applications and open it. See the [Mac app guide](docs/mac-app.md) for unsigned-preview approval and existing-installation migration.
2. Install [Google Chrome](https://www.google.com/chrome/) if needed. The app includes its own runtime; no developer tools are required.
3. Follow the six setup steps inside the app. Save the room name, actual Google sign-in email and time zone.
4. Create your own Google Cloud Desktop OAuth client, import its JSON using the native file chooser, and connect Google in your system browser. Then sign into the separate room Chrome profile with the same account. [Google setup guide](docs/google-setup.md).
5. Approve and test camera, microphone and speakers with another participant. New rooms stay paused until you enable automatic joining.
6. Optionally configure a dedicated [drop-in room](docs/drop-in.md) and [branded room URL](docs/branded-room-url.md), then complete the real call check.
7. Enable **The Portal → Open at Login** if this Mac should run the room after each login.

**Prefer source or agent installation?** Clone directly or fork, then follow [source installation](docs/installation.md) or [agent setup](docs/agent-setup.md). Source builds require Apple's developer tools; downloaded apps do not. A fork is optional.

The Google setup is required because this is a forkable application using your own OAuth client. There is no shared public OAuth client or claim that Google has verified this project. Gmail and Workspace accounts have different consent-screen steps; the guide covers both.

## One memorable URL for your team

Give each room an address such as **`https://meet.example.com/miami`**. A teammate opens it and joins Google Meet; The Portal detects the visitor and automatically joins from the Mac mini.

**[Create your branded room URL →](docs/branded-room-url.md)** includes a Vercel redirect template, domain/DNS instructions, team-access guidance and an end-to-end checklist. No public server on the Mac is needed. Google Meet controls who can enter.

## Help us build the best Portal

Meeting rooms should be easy to join and easy to trust. Help us make The Portal the most reliable, welcoming open-source Google Meet room for a Mac mini.

**Your first PR does not need to be big.** Fix a confusing setup step. Reproduce a browser failure with a synthetic test. Improve recovery after a network outage. Every contribution that makes the next room easier to set up matters.

- **Have a Mac mini?** Follow the guide and [report your setup results](https://github.com/themobilefirstco/the-portal/issues/new?template=setup-report.yml). A documented failure is useful too.
- **Write code?** Pick a task from the [roadmap](docs/roadmap.md), fork the project, and open a draft PR. Include the problem, the fix and how you tested it.
- **Care about a great Mac experience?** Help define accessible onboarding and recovery flows. Test the native app on your Mac and help improve onboarding, accessibility and recovery.
- **Know someone building meeting rooms?** Share the project. Star it if you want to help others discover it, and watch releases for future updates.

Read [CONTRIBUTING.md](CONTRIBUTING.md) for a safe development setup. Keep PRs focused; open an issue before a large change. Never include real credentials, meeting links, attendee details or browser profiles. We welcome first-time contributors, documentation improvements and candid bug reports.

## Everyday use

Open **The Portal** from Applications, the Dock or its menu bar icon. Closing its window keeps the room running; quitting stops it and closes the room Chrome session. For source installations, run `Open Portal.command` to reopen the authenticated control page. A bare `http://127.0.0.1:4280` page deliberately cannot change settings without its control key. Run `Stop Portal.command` to stop the controller and disable login startup, preserving settings and credentials.

The service runs **after this macOS user logs in**, not at the FileVault unlock screen. It prevents idle sleep while active, but does not configure automatic login, TV power, power-loss restart, or network availability. See [installation and operation](docs/installation.md).

**Source installation update:** leave any active call, pull a reviewed release into your fork, and run `./setup.command` again. Setup stages application files and checks startup. If activation fails, it attempts to stop the new service and restore the previous installation; if stopping fails, it preserves both copies for manual recovery. Google state is kept separately. This preview requires source updates; it does not silently download app updates.

## Development

```bash
bash scripts/bootstrap.sh     # runtime and Keychain helper only; no service installation
runtime/node scripts/check.mjs
runtime/node scripts/test.mjs # full suite including temporary headless Chrome
runtime/node scripts/test.mjs --unit
```

Tests use synthetic accounts, temporary state, and temporary browser profiles. They do not join real meetings. Full browser tests require Chrome; the test runner refuses to silently skip it on macOS. Google OAuth is disabled in the synthetic HTTP-test mode.

See [architecture](docs/architecture.md), [contributing](CONTRIBUTING.md), [security](SECURITY.md), [troubleshooting](docs/troubleshooting.md), and [validation status](docs/validation.md), [code/security review](docs/qa-review-2026-10-31.md). Runtime downloads and bundled notices are described in [third-party notices](THIRD_PARTY_NOTICES.md).

## Important boundaries

The Portal reads the account's **primary Calendar**, not its email inbox. Pasted links in descriptions are not enough: invite the account and use the event's Google Meet conference field. Room-resource calendars and email aliases are not interchangeable with a Google user login in this release.

Drop-in detection starts after someone actually joins; visiting a URL, opening a preview, or waiting for admission does not count. Meet's host, organization, and audience settings still apply. The Portal cannot bypass admission. Drop-ins have a three-hour maximum; unknown participant data never means “everyone left.”

Camera/mic controls being on are not proof that a remote participant hears and sees the room. Confirm two-way media and the chime with a person during setup. Keep Chrome up to date and rerun the acceptance checklist after major browser or OS changes.

MIT licensed. Built by The Mobile-First Company. Not affiliated with or endorsed by Google or Apple.
