# Contributing

The Portal currently supports Google Meet, Google accounts and macOS. Prioritize correctness, setup clarity and recovery behavior before visual redesign. Open an issue for proposed platform/provider expansion.

Fork and clone the repository, install Google Chrome and Apple's Command Line Tools, then run:

```bash
bash scripts/bootstrap.sh
runtime/node scripts/check.mjs
runtime/node scripts/test.mjs
```

Bootstrap prepares the runtime but does not install a login service. Tests use disposable state and synthetic pages. `--unit` excludes the real-browser fixtures; use it for fast iterations, but run the full suite on macOS before merging browser changes.

For manual development, use a separate test Google account, a separate `PORTAL_DATA_DIR`, and unused controller/agent ports. Never point a development checkout at an occupied production room. Do not commit private settings or recorded Google page content containing names, emails or links.

Looking for a starting point? See the [contribution roadmap](docs/roadmap.md). First-time contributors and draft PRs are welcome. Use the setup report template to share a sanitized reproduction or documentation improvement.

PRs should explain the concrete behavior change, include meaningful regression tests, and update the relevant setup/operation docs. Preserve account identity checks, owned-target closure, mute respect, bounded retries and persistent manual-leave suppression. Use synthetic DOM/API fixtures for failures. Report live hardware testing separately from unit/fixture results.

Do not change Google scopes without documenting why, how consent changes and whether verification is required. Do not add telemetry or remote services without an explicit product/security decision. Keep dependency versions pinned and preserve runtime license notices.

By contributing, you agree that your contributions are licensed under the repository's MIT license. Do not submit code or assets you do not have permission to contribute.
