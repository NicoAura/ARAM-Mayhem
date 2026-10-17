#!/bin/bash
# Builds DeepARAM.app into apps/macos/build/. Needs Xcode or the Command Line Tools (swift, iconutil).
#   apps/macos/scripts/build-app.sh            # this Mac's architecture, ad-hoc signed
#   UNIVERSAL=1 apps/macos/scripts/build-app.sh  # Apple silicon + Intel
#   SIGN_ID="Developer ID Application: ..." apps/macos/scripts/build-app.sh
set -euo pipefail

cd "$(dirname "$0")/.."
VERSION="${VERSION:-0.1.0}"
BUILD="${BUILD:-$(git rev-list --count HEAD 2>/dev/null || echo 1)}"
SIGN_ID="${SIGN_ID:--}"
OUT=build
APP="$OUT/DeepARAM.app"

ARCH_FLAGS=()
if [[ "${UNIVERSAL:-0}" == 1 ]]; then ARCH_FLAGS=(--arch arm64 --arch x86_64); fi

echo "› Testing the shared package"
swift test --package-path ../shared/DeepARAMKit

echo "› Compiling"
swift build -c release "${ARCH_FLAGS[@]}"
BIN="$(swift build -c release "${ARCH_FLAGS[@]}" --show-bin-path)/DeepARAM"

echo "› Assembling $APP"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$BIN" "$APP/Contents/MacOS/DeepARAM"
sed -e "s/__VERSION__/$VERSION/" -e "s/__BUILD__/$BUILD/" Resources/Info.plist > "$APP/Contents/Info.plist"

ICONSET="$OUT/AppIcon.iconset"
rm -rf "$ICONSET" && mkdir -p "$ICONSET"
for s in 16 32 128 256 512; do
  sips -z $s $s Resources/AppIcon-1024.png --out "$ICONSET/icon_${s}x${s}.png" >/dev/null
  sips -z $((s * 2)) $((s * 2)) Resources/AppIcon-1024.png --out "$ICONSET/icon_${s}x${s}@2x.png" >/dev/null
done
iconutil -c icns "$ICONSET" -o "$APP/Contents/Resources/AppIcon.icns"
rm -rf "$ICONSET"

echo "› Signing ($SIGN_ID)"
OPTS=(--force --sign "$SIGN_ID" --entitlements Resources/DeepARAM.entitlements)
[[ "$SIGN_ID" != "-" ]] && OPTS+=(--options runtime --timestamp)
codesign "${OPTS[@]}" "$APP"
codesign --verify --strict "$APP"

echo "✓ Built $(pwd)/$APP"
