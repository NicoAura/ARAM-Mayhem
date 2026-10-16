"""Build data.js for the Augment Odds tool from CommunityDragon.

Usage: python3 build_data.py [--channel latest|pbe]
Writes data.js next to this script: every enabled Mayhem augment with its tier, the cards shown per
offer and the starting rerolls. Python 3 standard library only.
"""
import argparse, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
from cdragon import BASE, Game, clean, get, write_data_js  # noqa: E402

TIERS = ["Silver", "Gold", "Prismatic"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--channel", default="latest")
    g = Game(ap.parse_args().channel)
    k = g.kiwi

    # The Mayhem pool: the AugmentList object in kiwi.bin; entries marked Enabled: false never show up.
    pool = next(v["AugmentList"] for v in k.values() if isinstance(v, dict) and len(v.get("AugmentList", [])) > 50)
    augments = []
    for path in pool:
        a = k.get(path)
        if not a or a.get("Enabled") is False:
            continue
        augments.append({
            "key": a["AugmentNameId"], "name": g.strings.get(a["NameTra"].lower(), a["AugmentNameId"]),
            "tier": TIERS[a.get("rarity", 0)], "icon": g.asset_url(a["AugmentSmallIconPath"]),
            "ability": bool(a.get("IsAbilityAugment")),
            "text": clean(g.strings.get(a["AugmentTooltipTra"].lower(), ""))[:300],
        })
    augments.sort(key=lambda a: (TIERS.index(a["tier"]), a["name"].lower()))

    # Map12's Kiwi config: cards per offer by tier, and the augment manager's starting rerolls.
    m = get(f"{BASE}/{g.ch}/game/data/maps/shipping/map12/map12.bin.json")
    offer = next(v for v in m.values() if isinstance(v, dict) and "{857c9848}" in v)
    cards = {TIERS[int(r)]: n for r, n in offer["{8794a0e6}"].items()}
    manager = m["Maps/Shipping/Map12/Spells/ARAM_Augment_Manager"]["mSpell"]["DataValues"]
    rerolls = next(d["values"][0] for d in manager if d["name"] == "InitialReroll")

    write_data_js(os.path.join(HERE, "data.js"), "ODDS_DATA",
                  {"patch": g.version, "channel": g.ch, "cards": cards, "rerolls": rerolls, "augments": augments})
    counts = {t: sum(a["tier"] == t for a in augments) for t in TIERS}
    print(f"{g.version}: {counts}, cards {cards}, rerolls {rerolls}")


if __name__ == "__main__":
    main()
