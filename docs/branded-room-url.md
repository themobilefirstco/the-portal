# Give your room a URL your team remembers

Create an address such as **`https://meet.example.com/miami`**. Teammates open it, join Google Meet, and The Portal joins from the room's Mac mini when it detects a visitor.

```text
Team member opens meet.example.com/miami
    → HTTPS redirect to your dedicated Google Meet
    → Team member joins using their Google account
    → The Portal detects the visitor and joins from the Mac mini
```

The branded link is optional. It does not require running a public server on your Mac. This guide uses Vercel, the redirect approach used for the original room. Other hosts with HTTPS path redirects can do the same job.

## 1. Prepare the actual room

Complete the [drop-in setup](drop-in.md) first. Create a dedicated Meet owned by the room's Google account, connect Meet monitoring, and test joining directly from a different team account. Keep this same Google Meet URL in Portal's **Drop-in room** field. Do not paste the branded address into that field.

You need a domain you control, access to its DNS settings, and a hosting account. Owning `example.com` lets you create `meet.example.com`; `/miami` is a route on the host, not a DNS record.

## 2. Deploy the small redirect project

1. Copy the two files in [examples/branded-room-url](../examples/branded-room-url) into a **separate private GitHub repository**, for example `team-room-links`. Keep the public Portal fork free of your real meeting destinations.
2. In `vercel.json`, replace **both** placeholder destinations with the dedicated Google Meet URL. Change both `/miami` paths if you prefer another room name. The placeholder intentionally is not a usable meeting code.
3. Import that repository as a new Vercel project. Choose **Other** as the framework, no build command, and the repository root as the static output directory (`.` if the form asks). There are no packages to install. Deploy it.
4. Open `https://YOUR_PROJECT.vercel.app/miami` and confirm it reaches the intended Meet. If the host requires a Vercel login, review deployment protection for the production site before sharing with teammates.

The example uses `permanent: false`, which selects **307**, so the route is not a permanent redirect to a meeting code you may later replace. Never put OAuth credentials, Portal control keys or agent tokens in this project. See [Vercel configuration redirects](https://vercel.com/docs/routing/redirects/configuration-redirects).

If you already host the chosen subdomain on Vercel, merge these rules into its existing configuration rather than replacing it. Keep specific room paths before catch-all rules; legacy `routes` configurations need their own integration.

## 3. Connect your domain

In the Vercel project's **Settings → Domains**, add `meet.example.com`. At your DNS provider, create the CNAME record Vercel specifies for `meet`, using the **exact target shown for your project**. Preserve unrelated website and email records. Wait until Vercel confirms the domain and HTTPS certificate are ready. See [Vercel custom-domain setup](https://vercel.com/docs/domains/working-with-domains/add-a-domain).

DNS alone cannot redirect `/miami` to a Meet URL: it points the hostname at the redirect host. Do not point it at the Mac mini, its private network address, or `meet.google.com`.

## 4. Decide who may join

A memorable URL is not team authentication. Anyone receiving or forwarding the link can discover its Meet destination. Google Meet's access rules must enforce your intended audience even if someone uses that destination directly.

For a team room, choose settings that let the intended signed-in teammates enter **before the room account arrives**, while restricting other visitors as your Google account/Workspace policy allows. Check with your Workspace administrator if necessary. Avoid relying on “the host must join first”: Portal waits for an actual guest, which would create a deadlock. Use a different account from the room's account when testing.

The redirect does not bypass admission, wake a sleeping Mac, or indicate whether the room is busy. A preview or waiting-for-admission screen does not count as joining. See the [drop-in behavior and access checks](drop-in.md).

## 5. Verify, then share

- Open `https://meet.example.com/miami` and the trailing-slash version from another device. Confirm the intended Google Meet destination.
- Join with a teammate account. Confirm the Mac automatically joins, the chime sounds and both sides receive audio/video.
- Leave and confirm the room returns to its dashboard. Test an outside account against your intended audience policy.
- Share the branded URL in your team directory, chat bookmark or room QR code. Nobody needs the Mac's IP address or Portal control key.

To inspect just the redirect without joining a call:

```bash
curl -sS -I https://meet.example.com/miami
```

Expect a temporary redirect whose `Location` is your intended Meet URL. A trailing-slash normalization may add a redirect first. A 404 usually means the wrong project, path or project root; a certificate/DNS error means the custom domain is not ready.

## More rooms and future changes

Add a separate pair of routes for `/london`, `/paris`, or another room. Each physical room needs its own Portal configuration and dedicated Meet destination. If Google retires or changes a meeting code, update **both Portal and the redirect**, redeploy, and repeat the visitor test. Teammates keep using the same branded URL.

The template and configuration were checked locally against the documented format. A new custom domain was not provisioned as part of this documentation change; each operator must complete the deployment and live checks above.
