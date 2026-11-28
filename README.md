# PiChat

An email-first contacts app with account sign-up, optional profile photos, email invitations, and invitation acceptance tracking.

## Run locally

Requires Node.js 22.5 or newer.

```sh
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000). Accounts and invitations are stored in `messaging.sqlite` in the project directory.

## Install as an app (PWA)

PiChat ships as an HTML5 progressive web app. In Chromium-based browsers, use **Install app** from the address bar when the site is served over HTTPS (or on `localhost`). On iOS, open the site in Safari and choose **Add to Home Screen**. The service worker caches the app shell for faster reloads; messaging still needs a live connection to the server. Set `APP_URL` to your public HTTPS origin so invitation links and installs use the same host.

## Email delivery

Set `RESEND_API_KEY` in `.env` using a key from [Resend](https://resend.com/api-keys). For production, set `MAIL_FROM` to an address on a domain verified in Resend. The default `onboarding@resend.dev` sender is restricted to testing with your own verified recipient address. Set `APP_URL` to the publicly reachable address of the running app so invitation links work for recipients. Restart the server after changing environment variables.

Invitations are saved even if delivery fails, and the app provides a link to share manually. With Resend configured, the invitee receives an email with a link to accept or decline. The sender's invitation list updates automatically while open.

## Chat uploads and GIF search

Chat messages support text up to 10,000 characters and file or voice-message uploads up to 100 MB. Uploaded files are stored in the local `uploads` directory; back up that directory along with `messaging.sqlite`.

## Content settings

After signing in, choose a content setting. It can be changed later from the account menu. Message text is checked on the server against the recipient's saved setting; blocked text is replaced with “This message violates the recievers content settings”. Existing message text is checked again when a setting changes; attachments, GIFs, and voice messages are not filtered. The text filter uses word matching, not contextual moderation, so it cannot guarantee detection of every inappropriate or disguised phrase.

GIF search uses the GIPHY API. Put your key in `.giphy_key` at the project root (one line, no quotes), or set `GIPHY_API_KEY` in `.env`; the environment variable wins if both are set. The appearance menu includes common web fonts and accepts custom WOFF, WOFF2, TTF, and OTF font files up to 2 MB. Sticker files can be sent as regular attachments; third-party sticker catalogs are not bundled.