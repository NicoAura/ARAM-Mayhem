# DeepARAM for Windows

A small Tauri 2 app that opens deeparam.com in its own window. All features (Tier List, Simulator, PBE, champion pages) come straight from the live site, so the app never needs an update for new content.

What the app adds on top of the site:

- Native window that remembers its size and position, and reopens on the page you used last.
- Tray icon: Tier List, Simulator and PBE shortcuts, "Check for patch updates", toggles for patch notifications and "Start with Windows" (starts hidden in the tray).
- Closing the window keeps the app in the tray; Quit is in the tray menu. A second launch focuses the running app.
- Patch notifications: every 30 minutes it reads `https://deeparam.com/data/app-status.json` (`web/src/app/data/app-status.json/route.ts`) and notifies when the live patch or the PBE build changes.
- Offline: a bundled start page (`ui/index.html`) waits for the connection and retries; while browsing, a banner shows when the connection drops. WebView2 keeps its own disk cache, so pages already opened load fast.
- Links to other sites open in the default browser.

## Build

On Windows with Node 22 and Rust stable:

```
cd apps/windows
npm ci
npm run dev      # run against the live site
npm run build    # installers in src-tauri/target/release/bundle/{nsis,msi}
```

CI (`.github/workflows/windows-app.yml`) builds both installers on every change under `apps/windows/`, and on `main` attaches them to the `windows-v<version>` pre-release. Bump `version` in `src-tauri/tauri.conf.json` (and `Cargo.toml`, `package.json`) for a new release.

The installers aren't code-signed yet, so Windows SmartScreen shows "Windows protected your PC" on first run (More info, then Run anyway).

Icons are generated from `app-icon.png` with `npm run icons`.

The Rust code is cross-platform; macOS-only bits would go behind `cfg(target_os)` if the macOS app reuses it.
