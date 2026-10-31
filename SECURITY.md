# Security

The Portal can activate a room camera and microphone. Use a dedicated room account and make the room's automatic-join and Meet audience policy clear to occupants. Anyone allowed into an enabled drop-in room may trigger it; a branded redirect is not access control.

Google client data, refresh/access tokens, control keys and agent credentials are stored in macOS Keychain. Browser cookies remain in Chrome's dedicated private profile. Ordinary state files are owner-only, but include meeting metadata. The local machine and its signed-in user are trusted; this app does not defend against a compromised administrator or another process running with equivalent user access.

Do not publish credentials, browser profiles, production state, logs, meeting titles or live room links in a fork. The upstream GitHub repository also enables native secret scanning and push protection. Fork owners should check these settings in their own repository. CI runs a checksum-pinned Gitleaks scan across the available Git history, with fully redacted output. The source-pattern check adds a lightweight local safeguard. Neither tool can guarantee the absence of secrets or confidential metadata; inspect files and history before publication.

The controller binds to loopback and requires a control key. The optional API uses a separate bearer token, bounded commands, request IDs and rate limits. Never forward Chrome's debugging port. Use a private authenticated connection for remote maintenance; public port forwarding is unsupported.

Only the current preview is maintained. There is no signed release or automatic updater yet. Setup checks a pinned official Node checksum and builds the local credential helper; review source changes before running updates.

For a potential vulnerability, use [GitHub private vulnerability reporting](https://github.com/themobilefirstco/the-portal/security/advisories/new). If it is unavailable, open an issue asking for a private contact without including exploit details, credentials or personal data. Do not put secret material in public issues.
