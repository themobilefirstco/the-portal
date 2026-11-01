# Install the Mac app

The downloadable **0.2.0 unsigned preview** is a native macOS application containing the Portal controller and setup interface. It requires macOS 14 or later and Google Chrome. Users do not need Terminal, Node, Git, Xcode or Command Line Tools.

1. Download the matching DMG from [GitHub releases](https://github.com/themobilefirstco/the-portal/releases): `arm64` for Apple Silicon (M-series); `x64` for Intel. About This Mac identifies your processor.
2. Open the DMG and drag **The Portal** into **Applications**. Eject the disk image, then open the installed copy.
3. This preview is ad-hoc signed, **not Developer ID signed or notarized**. macOS may block it. Only open a preview you trust; follow Apple's supported Privacy & Security approval flow yourself if offered. Never disable Gatekeeper or run commands to remove quarantine. Managed Macs may prohibit unsigned applications entirely.
4. Install Google Chrome if missing (The Portal menu → Get Google Chrome). Follow the six setup steps: room, Google account, devices, drop-ins, room URL and test call.
5. Grant Google consent in your system browser, sign into the dedicated room Chrome profile, approve camera/microphone permissions and test two-way media with another person. The native wrapper does not remove Google's requirement to create your own Desktop OAuth client. Follow the [human checklist](human-only-checklist.md).
6. Optionally enable **The Portal → Open at Login**. macOS may require approval in System Settings → General → Login Items. This starts after user login, not before FileVault unlock.

Closing the window keeps the room running. Reopen it from the Dock or menu bar. **Quit The Portal** confirms before stopping its controller and closing the room Chrome session, including an active meeting. Do not quit during a call unless you intend to end it. If the native app crashes, its controller detects the missing parent and stops the room browser.

## Existing source installations

Quit/stop the old controller before opening the app (`Stop Portal.command` in the old checkout). The app refuses to take over an occupied control port and never silently interrupts a running room. Both formats use the same state directory and Keychain service identifiers. Rebuilt or moved unsigned helpers may prompt for Keychain authorization again. Keep a private state backup before migration and validate on your hardware. This preview does not migrate unrelated legacy room controllers.

## Updates and removal

Quit and stop the room, download the new DMG, replace the app in Applications, then reopen it. There is no silent updater. State and credentials remain outside the app bundle. To uninstall, turn off Open at Login, quit the app, and move it to Trash. This preserves private room state and Keychain credentials; deleting those is a separate owner decision. If an older source LaunchAgent remains installed, stop it separately.

## Files and security

State: `~/Library/Application Support/The Portal/state`. Native app log: `~/Library/Application Support/The Portal/desktop.log`. Existing source-service logs remain separate. Treat logs, Chrome profiles and state as private. Room controls stay on loopback port 4280; optional bearer API on 4281. The app does not expose them publicly.

The setup view uses a nonpersistent WebKit session. Google authentication and external HTTPS links open in the system browser. Remote pages cannot navigate inside the authenticated control view. OAuth JSON import uses a native file chooser; redirect-file export uses a native Save dialog. Room meetings still run in dedicated Google Chrome.

## Build and release

Contributors need Xcode/Command Line Tools and the pinned bootstrap runtime:

```sh
bash scripts/bootstrap.sh
runtime/node scripts/check.mjs
runtime/node scripts/test.mjs
runtime/node scripts/build-mac.mjs --unsigned --testing
runtime/node scripts/test-mac.mjs
runtime/node scripts/build-mac.mjs --unsigned --dmg
```

Build on Apple Silicon for arm64 and Intel for x64. GitHub CI builds both. The test app is isolated on port 43880 with temporary state and Google authorization disabled; it cannot be packaged as a DMG. The shipping app contains no synthetic-test launcher mode. Build input is an explicit whitelist, excluding profiles, credentials, working files and developer caches. SHA-256 checksums accompany downloads.

For future trusted distribution, set `PORTAL_SIGNING_IDENTITY` to a locally installed **Developer ID Application** identity and omit `--unsigned`. Nested executables and the app are signed with hardened runtime; Node receives JIT entitlements. Then submit the DMG with Apple's `notarytool`, wait for acceptance, staple the ticket, verify Gatekeeper assessment on a clean Mac and regenerate the checksum. A signed-but-unnotarized artifact is not a trusted public release. Never commit signing keys or notarization credentials. See [Apple's distribution guidance](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution).

## Validation limits

CI checks the native navigation policy, launches a real WebKit window against a synthetic controller, verifies authenticated onboarding renders, and checks that quitting stops the controller. It also runs the full Chrome fixture suite. These checks do not prove first-download Gatekeeper approval, fresh-user Keychain prompts, real Google consent, Login Items behavior, physical audio/video or an overnight room pilot. Complete the [acceptance checklist](acceptance.md) on a real Mac mini before unattended use.
