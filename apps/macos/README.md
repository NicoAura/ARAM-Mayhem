# DeepARAM for Mac

A native macOS window around deeparam.com: the site's pages (Tier List, Simulator, PBE and the rest) run
in a WKWebView, and the app adds what a browser tab can't.

- **Menus and shortcuts**: Go menu with every section on ⌘1–⌘8, ⌘[ / ⌘] back and forward, ⌘K search
  (opens the site's own search), ⌘R reload, ⌘+ / ⌘− / ⌘0 zoom, ⌘T new tab, ⌘⇧C copy link,
  ⌘⇧O open in browser.
- **Offline**: the main sections are loaded into the cache once a day (and after each new patch). With no
  connection, pages fall back to their saved copy with a banner; unsaved pages show a short offline page.
- **Patch notifications**: every 3 hours (and on wake) the app reads `/data/app-status.json` and posts a
  notification when a new live or PBE patch appears. Clicking it opens the Tier List or PBE page.
- Links to other sites open in the default browser. Sign-in and settings persist like Safari's.

Shared logic (sections, link rules, patch check) lives in `apps/shared/DeepARAMKit`, which the iOS and
iPadOS apps use too.

## Build

Needs macOS 13+ and Xcode or the Command Line Tools.

```sh
apps/macos/scripts/build-app.sh          # runs the shared package's tests, then builds
open apps/macos/build/DeepARAM.app
```

`UNIVERSAL=1` builds for Apple silicon and Intel. The default is ad-hoc signed, fine on this Mac; to hand
it to others, set `SIGN_ID` to a Developer ID identity and notarize the result.

For quick iteration `swift run --package-path apps/macos` works too, without notifications (they need the
app bundle).
