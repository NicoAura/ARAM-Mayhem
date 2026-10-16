"""Build art.js for the Augment Odds offer cards from the Mayhem augment-selection screen art.

Usage: python3 build_art.py [--channel latest|pbe]
Writes art.js next to this script: the card background and each tier's icon back layer and ability frame,
as small WebP data: URIs so the page works anywhere without loading files from CommunityDragon.
Needs Pillow (pip install pillow) to crop and compress the images.
"""
import argparse, base64, io, os, sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
from cdragon import BASE, get  # noqa: E402

DIR = "game/assets/ux/kiwi/augments/augmentselection"


def uri(img, quality=80):
    buf = io.BytesIO()
    img.save(buf, "WEBP", quality=quality, method=6)
    return "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--channel", default="latest")
    ch = ap.parse_args().channel

    def load(name):
        return Image.open(io.BytesIO(get(f"{BASE}/{ch}/{DIR}/{name}.png", raw=True))).convert("RGBA")

    # The holo card is a 512px canvas with the card shape in the middle; keep just the card.
    card = load("augmentcard_bg_holo_02")
    card = card.crop(card.getbbox())
    card.thumbnail((240, 420))
    art = {"card": uri(card, 70)}
    for tier in ("silver", "gold", "prismatic"):
        back = load(f"augmenticon_defaultbacklayer_{tier}")
        back = back.crop(back.getbbox())
        back.thumbnail((160, 160))
        art[f"back_{tier}"] = uri(back)
        art[f"frame_{tier}"] = uri(load(f"abilityframe_{tier}"), 90)

    with open(os.path.join(HERE, "art.js"), "w", encoding="utf-8") as f:
        f.write("window.ODDS_ART = {\n" + ",\n".join(f' "{k}": "{v}"' for k, v in art.items()) + "\n};\n")
    print("art.js:", {k: len(v) for k, v in art.items()})


if __name__ == "__main__":
    main()
