# Human-only setup checklist

An agent can install, configure and diagnose The Portal. The owner must complete these steps in order on the room Mac. Never share passwords, OAuth JSON or bearer tokens in a PR or chat.

1. **Prepare the Mac.** Log into a graphical macOS session, install Chrome and Apple's command-line developer tools if prompted. Connect the display, webcam, microphone and speakers. Keep the Mac awake for room use.
2. **Authorize Keychain.** Unlock the login Keychain and allow the Portal helper when macOS asks during normal setup. If the agent used non-interactive setup and it stopped, rerun `setup.command` normally. Do not disable system security to bypass a prompt.
3. **Prepare Google.** Choose a dedicated room account. Create your own Google Cloud project and Desktop OAuth client using [Google setup](google-setup.md). Configure audience/test users or Workspace restrictions, enable the required APIs, and download the private client JSON. Import it locally. Your organization may require an administrator's approval.
4. **Grant Google consent.** In Portal's Google step, connect that exact account and review the requested Calendar/Meet access. Complete consent yourself. The agent must pause here; importing a client file alone is insufficient.
5. **Sign into room Chrome.** Use Portal's dedicated Chrome window, sign into the same account, then verify it in Portal. Your everyday browser session is separate.
6. **Allow and test devices.** Grant camera and microphone permission in macOS and Chrome when requested. Join a call from another device, confirm both directions of audio, camera framing and absence of echo. Mark the device confirmation only after testing.
7. **Configure optional drop-ins.** Create a dedicated Google Meet link and choose its host/access rules. Confirm who may enter without knocking. Enable Meet monitoring with the requested Google consent, then save the link. [Drop-in details](drop-in.md).
8. **Publish an optional branded address.** Follow [the domain guide](branded-room-url.md). Control DNS and hosting yourself. Open the branded URL from another device and check that it resolves to the correct Meet room before marking it verified.
9. **Complete a real room test.** Send an invitation or join the drop-in room from another device, enable automatic joining and observe join, camera, microphone, departure and recovery. Review [acceptance checks](acceptance.md). Keep the room paused if anything fails.
10. **Authorize optional agent controls.** Decide which local agent may join/leave calls before enabling its bearer token. Read [agent setup](agent-setup.md), then run doctor and resolve outstanding checks.

An agent should report the exact unfinished step and wait. It must not fabricate consent, permissions, successful calls or hardware verification.
