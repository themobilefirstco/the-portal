# Validation status

This page separates executed checks from release criteria. Do not treat a successful fixture run as proof of real Google account setup, camera/microphone transmission or unattended uptime.

## October 31, 2026

- The original office controller's 79 existing tests passed on its Mac mini before extraction.
- The Portal adds configuration, account independence, health regressions, nonblocking polling, stale-response invalidation, Keychain transport, installation rollback and second-account OAuth fixtures.
- The Portal runtime bootstrap downloaded the pinned official Node archive, verified its SHA-256 and compiled the Swift credential helper on the development Mac and in an isolated directory on the Mac mini.
- All 90 tests (including two real headless Chrome tests, with no skips) in the extracted Portal suite passed on the Apple Silicon Mac mini using temporary state and synthetic headless Chrome. The production room service and its account were not replaced or reconfigured by these checks.
- On the development Mac's managed execution environment, the logic/HTTP suite passes but temporary headless Chrome startup is restricted. The real-browser suite is therefore exercised on the Mac mini instead; no browser success is inferred from a skipped test.

- A dummy Keychain round-trip attempted over SSH was denied by macOS. Keychain transport fixtures pass, but interactive credential storage must still be verified in a logged-in desktop session.

The CI workflow runs the full synthetic suite on macOS 15 for Apple Silicon and Intel. A workflow definition is not evidence that its hosted runs have passed; inspect the repository's Actions results for the current commit.

## Still required before an unattended production claim

- A fresh external organization or personal Gmail account following the public guide from start to finish.
- A real scheduled invitation and drop-in with no manual Join click, verified two-way audio/video and an audible chime under this Portal build.
- Full installation/upgrade/login recovery in a new macOS user environment, including Keychain prompts.
- Reboot, display/device reconnection, long API outage and overnight operation.
- Intel hardware validation and the two-room multi-day pilot described in [acceptance](acceptance.md).

The first release is intentionally a source preview. Native designed UI, notarized distribution, signed automatic updates and fully validated unattended hardware support are not claimed.
