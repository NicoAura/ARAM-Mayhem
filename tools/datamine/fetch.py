"""Download the PBE and live files the Mayhem datamine compares, from CommunityDragon.

Usage: python3 fetch.py OUT_DIR
Creates OUT_DIR/pbe and OUT_DIR/latest with the same file layout.
"""
import json, os, sys, urllib.request
from concurrent.futures import ThreadPoolExecutor

BASE = "https://raw.communitydragon.org"
GAME_DATA = "plugins/rcp-be-lol-game-data/global/default/v1"
FILES = [f"{GAME_DATA}/{n}.json" for n in (
    "augment-lists", "cherry-augments", "kiwi-hub", "items", "perks",
    "game-mode-mutators", "queues", "champion-summary")] + [
    "game/maps/modespecificdata/kiwi.bin.json",
    "game/maps/modespecificdata/aram.bin.json",
    "game/data/maps/shipping/map12/map12.bin.json",
    "game/items.cdtb.bin.json",
    "game/en_us/data/menu/en_us/lol.stringtable.json",
]

def get(url, dest):
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    with urllib.request.urlopen(url, timeout=180) as r, open(dest, "wb") as f:
        f.write(r.read())

def main(out):
    jobs = []
    for channel in ("pbe", "latest"):
        for path in FILES:
            jobs.append((f"{BASE}/{channel}/{path}", os.path.join(out, channel, os.path.basename(path))))
    with ThreadPoolExecutor(8) as ex:
        list(ex.map(lambda j: get(*j), jobs))
    champs = [c["alias"].lower() for c in json.load(open(os.path.join(out, "pbe", "champion-summary.json"))) if c["id"] > 0]
    jobs = [(f"{BASE}/{ch}/game/data/characters/{c}/{c}.bin.json", os.path.join(out, ch, "ch", f"{c}.json"))
            for ch in ("pbe", "latest") for c in champs]
    with ThreadPoolExecutor(16) as ex:
        list(ex.map(lambda j: get(*j), jobs))
    for ch in ("pbe", "latest"):
        meta = json.load(urllib.request.urlopen(f"{BASE}/{ch}/content-metadata.json"))
        print(ch, meta["version"])

if __name__ == "__main__":
    main(sys.argv[1])
