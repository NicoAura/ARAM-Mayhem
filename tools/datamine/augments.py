"""Diff the Mayhem (KIWI) augment pool between live and PBE.

Usage: python3 augments.py DATA_DIR
"""
import json, os, sys

def pools(d):
    return {x["modeName"]: x["augmentList"] for x in json.load(open(os.path.join(d, "augment-lists.json")))}

def main(root):
    live, pbe = pools(os.path.join(root, "latest")), pools(os.path.join(root, "pbe"))
    names = {}
    for ch in ("latest", "pbe"):
        for a in json.load(open(os.path.join(root, ch, "cherry-augments.json"))):
            names[a["augmentNameId"].lower()] = (a["nameTRA"], a["rarity"])
    def name(path):
        t = path.split("/")[-1].lower()
        return names.get(t) or names.get("aram_" + t) or ("?", "?")
    for mode in ("KIWI", "KIWI_JADE"):
        added, removed = set(pbe[mode]) - set(live[mode]), set(live[mode]) - set(pbe[mode])
        print(f"{mode}: {len(live[mode])} -> {len(pbe[mode])} (+{len(added)} / -{len(removed)})")
        for p in sorted(added):
            print("  +", p.split("/")[-1], name(p))
        for p in sorted(removed):
            print("  -", p.split("/")[-1], name(p))

if __name__ == "__main__":
    main(sys.argv[1])
