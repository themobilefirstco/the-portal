# Live acceptance checklist

Run this on every new room and after important Chrome/macOS changes. Use a second participant outside the room to verify audio/video. Automated fixture tests cannot establish hardware, Google policy or remote media success.

- [ ] Fresh clone/fork: run setup on a Mac without prior Portal state. Controls open; app version and heartbeat respond.
- [ ] Configure a room name, actual Google email and correct time zone without editing source.
- [ ] Connect Calendar and the dedicated Chrome account. A different Google identity is rejected.
- [ ] In the dedicated profile, grant genuine camera/mic permissions and select the intended devices. Confirm local preview and two-way audio/video with the second participant.
- [ ] Resume auto-join. Send a new timed event from another account with native Meet conferencing and an explicit room invitation. It appears without manual refresh and joins without clicking Join on the Mac.
- [ ] Test host admission and its timeout. Do not confuse waiting for host with a device failure.
- [ ] Leave manually; the same event does not automatically rejoin. Test Retry join for an eligible ongoing scheduled invitation.
- [ ] Test scheduled deadline, local extension, cancellation, changed link, overlapping events, and a daylight-saving boundary.
- [ ] For drop-ins, confirm an actual guest triggers a clearly audible chime and working media. Another guest does not create a second call.
- [ ] Everyone leaves: confirm the 15-second continuous-absence behavior plus observation latency. Return during the countdown to cancel it.
- [ ] Verify the original dashboard tab and its in-page state survived the call.
- [ ] Pause prevents new calls; an active call continues until Leave or its deadline. Manual mute is not repeatedly undone.
- [ ] Close the room browser/window, disconnect/reconnect the room USB devices, and briefly interrupt the network. Confirm accurate degraded status and bounded recovery.
- [ ] Revoke API access or sign out of room Chrome. Confirm visible recovery instructions and no false “ready” state.
- [ ] During a maintenance window, test app update, failed activation recovery, user logout/login and reboot. Do not interrupt an occupied room to perform these tests.
- [ ] Test TV off/on and an overnight run followed by a fresh invitation.

Record date, commit/version, machine/OS/Chrome, account type, hardware, pass/fail, timings and sanitized error descriptions. Do not put real account credentials or meeting URLs in the record.

Before describing a release as robust for unattended use, target 100 controlled join/leave cycles across two Macs/accounts and a seven-day pilot with no orphan transmitting calls or false healthy states. This is a release criterion, not a claimed result of the preview.
