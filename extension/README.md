# 04AM Clipper — browser extension

This is one extension for Chrome, Edge, Firefox and Safari. It's for approved curators: sign in with your 04AM account (email and password). Any account that isn't linked to a curator profile on `/clip/team` gets turned away.

## Ways to clip

- **Toolbar icon.** Clicking it shows every image on the page that's big enough to be a reference, whole. Pick one.
- **Right-click an image** and choose *Clip image to 04AM*. Some sites (Instagram, for one) cover their images, so a right-click never reaches the image. There, right-click anywhere and choose *Choose an image to clip…*.
- **⌥⇧C** (Alt+Shift+C) opens the picker from the keyboard.

A panel opens beside the page. The page stays live behind it, so you can read or copy a credit line while you fill it in. The picker and the panel both close with the X in their top corner, or with Esc. Credits that the page itself publishes (JSON-LD creator, the author meta tag, `og:site_name`, `<figcaption>`) show up as dashed **suggestions**. They are never filled in for you. What you type is stored as a person's credit. Anything you leave blank is filled in later by the classifier, which marks it as inferred (`attribution_parsed_at`). *Found via* comes from the page address, from the same list the classifier uses (`lib/clips/attribution.ts`).

## Rights posture (same as the site)

- It sends **addresses only**: the page URL and the image's own URL. It never uploads, screenshots or crops anything. `data:` and `blob:` images are refused on the server (`lib/clips/clip-input.ts`).
- When the page offers the largest version of an image (`srcset`, `<picture>`), the clipper takes that one.
- It warns about signed CDN addresses that expire, such as Instagram's `oe=` links.
- An image that's already in the library is blocked, because it would count twice in every figure.
- Page access comes from `activeTab`. The script is injected only when you clip, never on page load, and the extension has no "read all sites" permission.

## Install it for yourself (unpacked)

**Chrome:** go to `chrome://extensions`, turn on *Developer mode*, click *Load unpacked*, and choose `~/my-app/extension`.

**Edge:** go to `edge://extensions`, turn on *Developer mode*, click *Load unpacked*, and choose `~/my-app/extension`.

**Firefox:** run `node extension/build.mjs` once, then go to `about:debugging#/runtime/this-firefox`, click *Load Temporary Add-on…*, and choose `~/my-app/extension/dist/firefox/manifest.json`. It's removed when Firefox quits. To keep it installed, sign it as an unlisted add-on on AMO (see below).

**Safari 26:** run `node extension/build.mjs` once. Open *Safari → Settings → Developer* (turn on "Show features for web developers" under *Advanced* first), click *Add Temporary Extension…*, confirm with your password, and choose `~/my-app/extension/dist/safari`. It's unloaded when Safari quits.

The `dist/` folders exist because Firefox and Safari read a slightly different manifest (no service worker, no `offscreen` permission). The plain `extension/` folder does load in them too — it just logs two harmless "ignored property" warnings.

After a code change, click reload on the extension card (Chrome/Edge/Firefox), or remove and add it again (Safari).

## Store builds

```
node extension/build.mjs
```

This writes `extension/dist/<browser>/` and `04am-clipper-<browser>-<version>.zip`. Each build keeps only the manifest keys that browser reads. `dist/` is gitignored.

| Store | Upload | Cost | Notes |
|---|---|---|---|
| Chrome Web Store | `…-chrome-*.zip` | one-time developer fee | Set visibility to *Unlisted*. |
| Edge Add-ons | `…-edge-*.zip` | free | *Hidden* listing is the unlisted equivalent. |
| Firefox AMO | `…-firefox-*.zip` | free | *On your own* (unlisted) gives a signed `.xpi` that stays installed. |
| Safari | `…-safari-*.zip` | Apple Developer Program, yearly | Packaged in App Store Connect with no Xcode needed. TestFlight works for a few testers. |

## Toolbar icon

The toolbar icon is the wordmark by itself, with no background: Ink when the browser is light and Bone when it's dark. It's **drawn from the vector wordmark** (`icons/wordmark.svg`, the same path as `components/wordmark.tsx`) at each exact pixel size the browser uses (16, 19, 24, 32, 38 and 48), so it stays crisp at every screen density. The top of the letters is snapped to a whole pixel. The PNGs `icons/toolbar-{ink,bone}-{16,32,48}.png` are only a fallback, for a browser that can't draw off-screen.

A manifest can't switch icons by theme, so `background.js` sets the icon itself. Firefox and Safari can read the colour scheme directly from their background page. Chrome and Edge use a small hidden page (`scheme.html`, permission `offscreen`), because their service worker can't read it. The square icons (`icons/icon-*.png`) are still used on the browser's extensions page and for store listings: those can't switch with the theme, and stores ask for a square.

## Browsers

| | Version needed | State |
|---|---|---|
| Chrome | 102+ | Run and tested end to end. |
| Edge | 102+ | Same engine and same build as Chrome; not run separately. |
| Firefox | 142+ | Mozilla's own validator (`web-ext lint`) passes with no errors or warnings; not run. |
| Safari | 16.4+ (works from 15.4) | Checked against Apple's and MDN's support tables; not run. |

The floors come from what the extension actually calls: `scripting.executeScript` (Chrome 88, Firefox 102, Safari 15.4), `storage.session` (Chrome 102, Firefox 115, Safari 16.4 — optional, it falls back to memory), `action.setIcon` with `imageData` (Chrome/Edge 88, Firefox 109, Safari 15.4), and `OffscreenCanvas` (Chrome 69, Firefox 105, Safari 16.4). Firefox's floor is 142 only because the manifest declares `data_collection_permissions`, which Firefox added in 140 and AMO now asks for.

Nothing is required that a browser can't do without: where `OffscreenCanvas` is missing the icon is drawn on an ordinary canvas (Firefox and Safari run the background as a page, so they have one), and where that's missing too it falls back to the PNGs. `storage.session` is optional. The keyboard shortcut works in Safari 14+, though only Safari 26 lets you change it.

## Talking to 04AM

It talks to `https://gradient-flax.vercel.app` by default. *Options → Developer* switches to `http://localhost:3000` for `npm run dev`. Switching signs you out.

| Endpoint | What it does |
|---|---|
| `POST /api/extension/session` | `{email, password}` signs in; `{refresh_token}` renews. Curators only. |
| `DELETE /api/extension/session` | Ends this session. |
| `GET /api/extension/me` | Returns who the token belongs to. |
| `POST /api/extension/lookup` | Returns whether the image is already in the library, clips already taken from this page, and found_via. |
| `POST /api/extension/clip` | Saves the clip. It uses the same validation and insert as the `/clip` form (`parseClipInput` + `insertClip`). |

The session is the account's own Supabase token, sent as `Authorization: Bearer …`. It's checked in `lib/clip-session.ts`, which is still the one session door. Legacy password curators need a linked account before they can use the extension.
