"""Download champion and augment icons into web/public/icons/.

The icons are the League client's own files, as CommunityDragon extracts them from each patch:
- champions/<Alias>.webp, from the client's champion-icons (Alias as in data/cn/champions.csv, e.g. MonkeyKing)
- augments/<id>.webp, from each Mayhem (KIWI) augment's small icon (id as in data/cn/augments.csv)

Each icon is resized to 64x64 WebP so the whole set stays small.

Usage:
  python3 -m pip install pillow
  python3 web/scripts/fetch_icons.py [--force]
"""
import argparse, io, json, os, re, time, urllib.request
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "public", "icons")
CD = "https://raw.communitydragon.org/latest"
GD = CD + "/plugins/rcp-be-lol-game-data/global/default/v1"
SIZE = 64


def fetch(url, tries=4):
    # CommunityDragon refuses Python's default User-Agent.
    req = urllib.request.Request(url, headers={"User-Agent": "deeparam-icons"})
    for attempt in range(tries):
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                return r.read()
        except OSError:
            if attempt == tries - 1:
                raise
            time.sleep(2 ** attempt)


def save(url, path, force):
    if os.path.exists(path) and not force:
        return False
    img = Image.open(io.BytesIO(fetch(url))).convert("RGBA").resize((SIZE, SIZE), Image.LANCZOS)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, "WEBP", quality=88, method=6)
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true", help="download icons that already exist again")
    force = ap.parse_args().force

    champs = json.loads(fetch(GD + "/champion-summary.json"))
    n = 0
    for c in champs:
        if c["id"] > 0:
            n += save(f"{GD}/champion-icons/{c['id']}.png", os.path.join(OUT, "champions", c["alias"] + ".webp"), force)
    print(f"champions: {n} new of {sum(c['id'] > 0 for c in champs)}")

    kiwi = json.loads(fetch(CD + "/game/maps/modespecificdata/kiwi.bin.json"))
    augs = [e for e in kiwi.values() if isinstance(e, dict) and e.get("AugmentPlatformId") and e.get("AugmentSmallIconPath")]
    n = 0
    for e in augs:
        url = CD + "/game/" + re.sub(r"\.(tex|dds)$", ".png", e["AugmentSmallIconPath"].lower())
        try:
            n += save(url, os.path.join(OUT, "augments", f"{e['AugmentPlatformId']}.webp"), force)
        except OSError as err:
            print("skipped augment", e["AugmentPlatformId"], err)
    print(f"augments: {n} new of {len(augs)}")


if __name__ == "__main__":
    main()
