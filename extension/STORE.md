# Chrome Web Store submission pack

Everything the dashboard asks for, written out. Fields are ready to paste.
Screenshots are in `extension/store/`.

**Recommended visibility: Unlisted.** The listing is reachable by link, doesn't
appear in search or the category pages, and installs in one click — which is
all 04AM needs while clipping is curators-only. It can be switched to Public
later without a new listing.

---

## Before you can submit

1. **A real contact address in `app/privacy/page.tsx`.** `PRIVACY_CONTACT` is
   still `privacy@04am.example`, a reserved address that can never receive
   mail. Google requires a privacy policy, and one you can't be written to at
   is worse than none. `lib/privacy.test.ts` fails the build if the page is
   ever linked while that placeholder stands.
2. **The privacy policy live at a public URL.** `https://gradient-flax.vercel.app/privacy`
   works today — a custom domain is not required for this.
3. **A developer account**, with the one-time registration fee paid and the
   account's email verified.

Nothing else is blocking. The package itself passes: Manifest V3, no remote
code, Mozilla's validator clean.

---

## Listing

**Item name**
```
04AM Clipper
```

**Short description** (132 characters max — this is 118)
```
Clip design references into 04AM from any page. Links only, shown whole, credited. For approved 04AM curators.
```

**Detailed description**
```
04AM is a reference library that reads visual trends from real design work. The 04AM Clipper is how its curators put work into it.

On any page, click the 04AM icon and every image large enough to be a reference appears — whole, never cropped. Pick one and a panel opens beside the page, with the credit the page itself publishes offered as a suggestion rather than filled in for you. The page stays readable behind it, so you can check a credit line while you type.

You can also right-click any image and choose "Clip image to 04AM". On sites that lay a transparent layer over their images, right-click anywhere and choose "Choose an image to clip…" instead.

WHAT IT SENDS
Two web addresses — the page and the image — plus the words you enter. It never uploads, screenshots or crops an image. A clip is a link: 04AM shows the original from where it was published, and if the work moves or is taken down at the source, it stops appearing.

WHAT IT DOESN'T DO
It has no access to your browsing. It reads a page only at the moment you click its icon, use its right-click item, or press its shortcut, and it declares no content scripts, so nothing runs in the background. There is no tracking or analytics of any kind.

WHO IT'S FOR
Approved 04AM curators. Signing in requires an 04AM account that an administrator has linked to a curator profile; any other account is signed straight back out.

Privacy policy: https://gradient-flax.vercel.app/privacy
```

**Category:** Productivity → Workflow & Planning
**Language:** English

**Graphics**
- Store icon, 128×128 — `extension/icons/icon-128.png`
- Screenshots, 1280×800 — `extension/store/shot-1-page.png` … `shot-4-signin.png`
  (in that order: the page, the picker, the panel, the sign-in)

---

## Privacy practices tab

**Single purpose**
```
Lets an approved 04AM curator save a reference from the page they are looking at into the 04AM library, by sending the page's address and the chosen image's address.
```

**Permission justifications**

| Permission | Justification |
|---|---|
| `activeTab` | Reads the current page only at the moment the curator clicks the extension's icon, uses its context-menu item, or presses its shortcut — to list the images on that page and read the credit the page publishes. No access at any other time. |
| `scripting` | Injects the image picker into that same tab, on that same explicit action. The extension declares no content scripts, so nothing is injected on page load. |
| `contextMenus` | Adds the "Clip image to 04AM" and "Choose an image to clip…" right-click items, which are two of the three ways to start a clip. |
| `storage` | Keeps the signed-in curator's session token, and which 04AM server the extension talks to, on their own machine. |
| `offscreen` | A service worker cannot read `prefers-color-scheme`. A hidden offscreen document reports it so the toolbar icon can be drawn in the right colour for a light or dark browser. |
| Host permission `https://gradient-flax.vercel.app/*` | The only server the extension contacts: signing in, checking whether an image is already in the library, and saving the clip. |

**Data types collected — tick these three**

| Type | Why |
|---|---|
| Personally identifiable information | The curator's email address, at sign-in. |
| Authentication information | The password, sent once at sign-in in exchange for a session token, and that token. |
| Website content | The address of the page being clipped, the address of the chosen image, and the title, author or caption that page publishes, when the curator accepts them. |

Leave unticked: health, financial and payment, personal communications,
location, web history, and user activity. On **web history** in particular —
the extension never reads or transmits the list of pages visited; it only
sends the single page a curator explicitly chooses to clip.

**Certifications — all three apply**

- Not being sold to third parties, outside of the approved use cases: **certify**
- Not being used or transferred for purposes unrelated to the item's single purpose: **certify**
- Not being used or transferred to determine creditworthiness or for lending purposes: **certify**

---

## After it's published

The store assigns a permanent extension ID. That unlocks the part the site
can't do yet — knowing whether a curator already has it installed:

1. Add `externally_connectable` to the manifest, matching the 04AM origin.
2. Add an `onMessageExternal` listener in `background.js` that answers a ping.
3. On `/clip`, send `chrome.runtime.sendMessage(<id>, { type: "ping" })`. If it
   answers, hide the install card; if not, show it with the store link instead
   of the download and the Developer-mode steps.

Note that Chrome removed install-from-page (inline installation) in 2018, so
the card can only ever link to the listing — the click happens on Google's
page, not 04AM's.

Two things to remember when the domain changes: `host_permissions` and
`externally_connectable` both name the origin, so moving off
`gradient-flax.vercel.app` needs a new version published to the store, and
old installs keep talking to the old address until they update.
