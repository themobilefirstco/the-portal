# Let people drop into the room

Complete [Google setup](google-setup.md) first. Create a **dedicated Google Meet meeting as the room account**, separate from normal scheduled calls. A recurring Calendar event can retain a reference to the room link, but no Google meeting code is guaranteed to last forever.

1. Enable Google Meet API in the same project as your Desktop OAuth client.
2. In Portal controls, click **Connect Google Meet monitoring** and grant the additional read-only metadata permission as the room account.
3. Configure the dedicated Meet's audience and host settings so the intended visitors can actually join before the room account arrives. Disable a waiting room only if that fits your audience policy. Do not broadly open an office camera without deciding who should have access.
4. Paste the dedicated Meet URL into **Drop-in room**. Confirm the access rules you configured and enable monitoring. The Portal resolves and pins its immutable space identifier.
5. Resume auto-join. From another device, actually join the room. Merely loading its URL or preview does not trigger the Mac.
6. Confirm the Mac chimes, opens the call, and transmits working audio/video. Leave from the visitor device and verify the Mac closes its meeting tab and returns to the unchanged dashboard.

Successful Meet checks are spaced by at least five seconds; Google latency adds to detection time. The controller excludes its own Google identity and follows participant pagination. Someone signed in as the same room account is not a reliable test visitor; use a different account.

After the last visitor is **confirmed** absent continuously for 15 seconds, the room leaves. Returning visitors or unknown/stale participant data cancel that timer. Scheduled calls take priority. A drop-in has a three-hour maximum even if participant monitoring remains unavailable; after that limit, the same conference will not be automatically rejoined. A manual Leave also suppresses rejoining that conference.

Failures are retried with bounded backoff. After three failed opening attempts, repair the issue and use **Retry current visitors**. The retry requires current guests, a verified room browser, fresh Calendar data, and no active or due scheduled call. A prior manual departure is not undone by this button.

For a memorable team address such as `https://meet.example.com/miami`, follow **[Create your branded room URL](branded-room-url.md)**. It includes the redirect files, hosting and DNS steps, and a visitor test.

You can share the Google Meet URL directly. A branded address can use an HTTPS redirect to it; it does not need an embedded Meet page or a Portal server on the internet. The redirect is optional and is not an access-control boundary. Google Meet's own settings govern entry, including forwarded links.

If a meeting URL changes, update it both in Portal and in any redirect. If the underlying meeting space disappears or the code is reassigned, the controller refuses to silently follow a different space.

References: [active participant filtering](https://developers.google.com/workspace/meet/api/reference/rest/v2/conferenceRecords.participants/list), [Meet resource concepts](https://developers.google.com/workspace/meet/api/guides/overview).
