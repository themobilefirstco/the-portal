# Troubleshooting

Start with room controls. Calendar, browser and guest monitoring are separate dependencies. Record the app version, macOS and Chrome versions, action taken, expected result and visible error. Do not post OAuth JSON, tokens, browser profiles, full meeting URLs or raw activity logs in public issues.

| Symptom | Check / recovery |
| --- | --- |
| Setup asks for developer tools | Run `xcode-select --install`, finish Apple's installation, then rerun setup. |
| Node checksum mismatch | Stop. Keep the existing installation; inspect the pinned release/checksums and download source. Do not remove the integrity check. |
| Chrome tests fail | Install Chrome in Applications; rerun in normal Terminal on the Mac. Managed/sandboxed execution can prevent temporary Chrome startup. Do not skip the full test gate to claim installation is validated. |
| Keychain unavailable | Unlock the login keychain and inspect any Portal helper access prompt. Rebuild with `bash scripts/bootstrap.sh` if missing. Never work around this by storing tokens in a public JSON file. |
| Controls say locked | Open with `Open Portal.command`. The key is delivered in a URL fragment, then removed and held in session storage; a bare URL has no authority. |
| Wrong Google account | Save the actual sign-in email, disconnect an old grant, and connect that same account in both OAuth and the dedicated room Chrome. |
| `redirect_uri_mismatch` | Verify the client JSON is for a Desktop app, not Web. Start authorization on the room Mac. Check local port conflicts. |
| App blocked / access denied | Check External test users, Internal organization eligibility, consent scopes, API enablement in the correct project, and Workspace administrator restrictions. |
| Works for a week then asks to reconnect | Check whether an External OAuth client remains in Testing. Follow the Production/verification steps in the Google guide. |
| Invitation never appears | Confirm the primary Calendar contains a timed, non-declined direct invitation to the configured account, with native Google Meet conference data. Check Calendar invitation filtering. |
| Meeting starts late or is missed | Calendar polling and browser/admission latency are not instant. A new meeting normally has a five-minute late-start window. Refresh Calendar and use Retry join for an ongoing invitation. |
| Waiting for host | Meet admission is controlled by the host/organization. Ask the host to admit the room or adjust their intended audience. Portal does not bypass it. |
| Camera starting forever | Verify permissions in macOS and the dedicated Chrome profile, device selection, USB/power, and whether another app owns the camera. The app attempts one tab recovery before entry, then reports failure. |
| Buttons on but no sound | Confirm actual speaker/mic selection with a remote participant. Toggle labels do not prove audio transmission. Test room speaker and system output separately. |
| Guest link does nothing | The guest must actually join with a different account. Check Meet API access, enabled/unpaused drop-ins, fresh Calendar and guest data, browser verification, and exhausted retries. |
| No chime | The chime uses macOS's main audio output via `afplay`, which may differ from Meet's selected speaker. Check volume/mute and output routing. |
| Call does not leave when alone | Scheduled calls wait until another participant has first been observed. Missing participant counts cancel the timer. Drop-ins use API observations; their three-hour maximum still applies. Use Leave if necessary. |
| Browser running but no TV window | Controls should report a display problem. The engine tries to recover a missing owned display; use Open room display when idle. Confirm display/input placement. |
| Port already in use | Stop the conflicting controller. Do not kill arbitrary processes. Installed Portal uses 4280 and 4281. |
| Startup registration fails | Setup retries transient launchd registration failures and restores the previous files if activation fails. Inspect the reported failure, confirm this user is logged into a GUI session, then retry from Terminal. |
| Mac does not recover after power loss | App startup, power-return settings and user login are separate. Review the installation guide and test those transitions explicitly. |

Pause prevents **new** calls; it does not leave the active call. Use Leave as well when you want the room disconnected. Manual Leave suppresses automatic rejoining of that event/conference.
