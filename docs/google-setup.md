# Connect your Google account

Use an existing account that can sign in to Google Meet and has a primary Google Calendar. A dedicated room account is recommended. Personal Gmail and Google Workspace user accounts are supported by the same code; organization policies can restrict API authorization and meeting entry.

You will make **two separate connections**: API authorization so The Portal can read invitations and participant metadata, and Google sign-in in the room's Chrome profile so that Chrome can participate in calls. Neither substitutes for the other. Never enter a Google password into The Portal.

## 1. Create your own Google project

Open [Google Cloud Console](https://console.cloud.google.com/) and create a project, for example `The Portal Room`. Keep that project selected throughout these steps. You do not need the project used by this repository's authors.

In **APIs & Services → Library**, enable **Google Calendar API**. Also enable **Google Meet API** if you want drop-ins. Verify both in the same selected project's enabled APIs list. A different project with the same API enabled does not help your OAuth client.

## 2. Configure Google Auth Platform

Google may label these screens Google Auth Platform or OAuth consent screen. Configure the app name, support email, and developer contact information.

| Account / audience | Choose | What to expect |
| --- | --- | --- |
| Workspace organization, only its own users | Internal, if available | The project must belong to the organization. An administrator may need to trust the client. |
| Personal Gmail or users from other organizations | External | During testing, add the exact room email to Test users. Before unattended operation, move to Production and follow the applicable verification requirements. |

An External app in **Testing** generally receives refresh tokens that expire after seven days when it requests these Calendar/Meet scopes. It is suitable for initial testing, not a permanent room. Publishing to Production and OAuth verification are distinct steps; follow Google's requirements for your audience and scopes. Do not promise an unverified shared client to the public. See [Google token expiration](https://developers.google.com/identity/protocols/oauth2#expiration) and [sensitive-scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification).

The Portal requests:

- `openid` and `email` to confirm the account identity.
- `https://www.googleapis.com/auth/calendar.events.readonly` for invitations.
- Optionally `https://www.googleapis.com/auth/meetings.space.readonly` for drop-in participants.

It does not request Gmail, Drive recordings/transcripts, calendar editing, or administrator privileges. Meet metadata and Calendar read access may require sensitive-scope review for public apps. A Workspace administrator can still block a client.

## 3. Create a Desktop app client

In **Clients → Create client**, choose **Desktop app**, name it `The Portal Mac`, and download its JSON. Do not choose Web application and do not create a service account. The Portal uses the desktop loopback flow with PKCE; you should not need to add a hosted callback domain.

Keep the JSON outside your repository, for example in Downloads temporarily. Never push it to your fork. The Portal stores imported credentials in your Mac's Keychain; after successful setup, remove unnecessary downloaded copies or retain them in your own secure storage.

## 4. Connect Calendar

Run `Open Portal.command`. Save the room email before connecting; enter the actual account email, not an alias. Choose the downloaded client JSON and click **Connect Google Calendar**. Your browser opens Google's own consent flow. Choose the configured room account and grant the requested permissions.

The callback returns to `http://127.0.0.1:4280/oauth/callback` on this Mac. A successful flow returns to the controls with Calendar connected. Do this on the room Mac (or through its screen sharing session), because opening the authorization URL on a different computer sends the loopback callback to that other computer.

An account mismatch is rejected even if Google granted permission. Reconnect with the correct account instead of changing code. If the consent window says the app is unavailable or blocked, resolve the project's audience/test-user/organization policy rather than bypassing Google controls.

## 5. Sign into room Chrome

Click **Open Google sign-in**. The Portal starts a separate Chrome profile, isolated from your normal browser. Sign into the same account, return to Meet, and click **Check account** in Portal controls. Signing into your regular Chrome profile does not complete this step.

In Meet, select your room camera, microphone, and speaker. Allow genuine Chrome site and macOS camera/microphone prompts. Make a short call with a second device and verify picture, microphone, speaker, and echo behavior. Avoid placing two unmuted devices next to each other.

## 6. Make invitations visible

In the room account's Google Calendar settings, inspect **Event settings → Add invitations to my calendar**. Choose a policy appropriate for your office. Restricting senders can prevent an invitation from appearing; the controller can only act on events returned by Calendar.

Create a timed event from another account, add Google Meet through Calendar, and explicitly invite the room email. A non-declined direct invitation may qualify without an RSVP. Cancelled, declined, all-day, description-only, Zoom and Teams events are ignored. The controller reads only the primary Calendar, and shows the next 48 hours.

After completing a real test, click **Resume auto-join**. Invitations refresh every 30 seconds. Once known, a meeting begins at its scheduled start, normally on a scheduler tick plus browser loading time. New calls normally have a five-minute late-start window; this is not an instant-delivery guarantee.

## Disconnect or change account

Leave any active call, then click **Disconnect Google access**. The Portal revokes its API grant, deletes stored API tokens, pauses automation, and closes its room Chrome instance. If revocation fails due to network trouble, retry online. Google Chrome's separate browser session is not the OAuth token; sign out of that dedicated profile if changing the machine's owner.

To change accounts, disconnect first, save the new room email, import a suitable client if needed, reconnect Google, sign into the matching room profile, and rerun the device/call test. The app clears browser verification and disables the previous drop-in configuration when the identity changes.

References: [desktop OAuth](https://developers.google.com/identity/protocols/oauth2/native-app), [OAuth policies](https://developers.google.com/identity/protocols/oauth2/policies), [Meet authorization](https://developers.google.com/workspace/meet/api/guides/authenticate-authorize).
