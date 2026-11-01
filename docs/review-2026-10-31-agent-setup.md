# Agent setup and interface review — 2026-10-31

## Findings addressed

The interface had too many competing surfaces: a large decorative shell, nested cards, oversized pixel headings and tiny functional text. The revision uses system typography, a consistent cream/teal/mint palette, flatter forms, shorter headings and restrained physical controls. Six setup steps retain real connection checks; browsing forward cannot manufacture a successful setup.

Agents previously needed browser clicks to install, configure and obtain runtime access. New entry documents, strict configuration schema, local apply command, non-interactive installer, owner-only bearer bootstrap and JSON doctor remove that dependency. The apply command reuses authenticated GUI endpoints rather than editing state. Account changes remain blocked while connected and during a call. Partial application is explicitly reported; it is not atomic.

The bootstrap token is created only through an authenticated local request, saved with exclusive creation and mode 0600, and never printed. Keychain requests travel on stdin and can suppress prompts. Google credentials remain external to the repository. No bearer settings endpoint was added.

## Remaining limitations and release gates

- Google OAuth, administrator policy, actual Chrome sign-in, OS permissions and physical media quality require the ordered human checklist.
- Node source preview, not a signed/notarized native application. `private: true` intentionally prevents accidental npm publication; it does not make GitHub private.
- Local commands require access to the logged-in owner's Keychain. Non-interactive provisioning stops when access is unavailable.
- Config applies sequentially; a later error does not roll back already accepted sections. Reports identify completed sections.
- The macOS login Keychain helper uses Apple's legacy interaction-suppression API for compatibility; Swift reports its deprecation. Migration should be validated against login Keychain ACL behavior on both Mac architectures.
- OpenAPI describes the existing runtime API. An optional MCP adapter is not included yet.
- Continuous log rotation and automated scoring of the full physical acceptance checklist remain follow-up work. Doctor is machine-readable readiness, not a substitute for that checklist.
- Real-room acceptance, 100 controlled call cycles and a seven-day pilot remain required before unattended-production claims. Automated synthetic Chrome fixtures cannot establish Google policy or remote audio/video success.

## Validation

Source/link/credential-pattern checks, unit/integration tests and real Chrome fixture tests are required before publishing. See GitHub CI for commit-specific outcomes. Run a dedicated secret scanner against working files and history. No actual room account or production Mac service should be modified during these checks.
