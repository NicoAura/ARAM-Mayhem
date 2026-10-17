# DeepARAM for Apple Watch

A small native SwiftUI app (watchOS has no web view), meant for a quick look mid-game:

- **Patch** in the title of the home screen.
- **Chef's Special:** today's build from The Lab, with how to play it, its augments and items.
- **Champions:** search by name (dictation or scribble), then see the skill max order, the build
  (boots first, then the build that wins most) and the top augments at each rarity. Pin
  champions you play to the home screen.
- **Offline:** the last download is kept on the watch and refreshed when the app opens (at most once an hour,
  or pull down to refresh).
- Riot's "not endorsed" notice is on the About screen.

It runs on its own (no iPhone needed) and is the watch companion of the iPhone & iPad app
(`com.deeparam.app.watchkitapp`, companion `com.deeparam.app`). Before an App Store release the watch target
also has to be embedded in the iPhone app's project so both ship together.

Data comes from `/data/watch.json` on the site. Until that file exists, the app builds the same data from
`/data/what-to-build.json` and the newest patch in the sitemap, without the Chef's Special.
The data code lives in `DeepARAMWatchKit` (no UI, so its tests also run on a Mac).

## Run it

Needs Xcode 16 or newer.

```sh
open apps/watchos/DeepARAMWatch.xcodeproj
```

Pick an Apple Watch simulator and press Run. From the command line:

```sh
cd apps/watchos/DeepARAMWatchKit && swift test
cd .. && xcodebuild build -project DeepARAMWatch.xcodeproj -scheme DeepARAMWatch -destination 'generic/platform=watchOS Simulator'
```
