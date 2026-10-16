"""Build data.js for the Zero Cooldowns tool from CommunityDragon.

Usage: python3 build_data.py [--channel latest|pbe]
Writes data.js next to this script: every champion's ability cooldowns, the Ability Haste items
and the Mayhem augments that add haste. Python 3 standard library only.
"""
import argparse, os, sys
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
from cdragon import Game, get, write_data_js  # noqa: E402

# Haste items beyond the plain "legendary with Ability Haste" ones: Lucidity boots, Spear of Shojin
# (basic Ability Haste only) and Wooglet's Witchcap (from a Mayhem quest augment).
EXTRA_ITEMS = [3158, 3161, 228002]
SKIP_ITEMS = {4403, 8010}  # The Golden Spatula is not buyable in Mayhem; 8010 is a second Bloodletter's Curse

AUGMENTS = ["ARAM_Recursion", "InfiniteRecursion", "ARAM_MadScientist", "ARAM_BacktoBasics", "ARAM_Eureka",
            "CritNCast", "ARAM_Purist_Caster", "ShrinkEngine", "ARAM_BreadAndButter", "ARAM_BreadAndJam",
            "ARAM_BreadAndCheese", "ARAM_Dashing", "SkipTheBasics", "UltimateAwakening",
            "ARAM_StuckInHereWithMe", "SurgeField"]


def champion(g, row):
    c = get(f"{g.gd}/champions/{row['id']}.json")
    spells = [{"key": s["spellKey"].upper(), "name": s["name"],
               "cd": [round(x, 2) for x in (s.get("cooldownCoefficients") or [0] * 6)[:5]]} for s in c["spells"]]
    return {"alias": row["alias"], "name": row["name"], "icon": g.champion_icon(row["id"]), "spells": spells}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--channel", default="latest")
    g = Game(ap.parse_args().channel)

    rows = [r for r in get(f"{g.gd}/champion-summary.json") if 0 < r["id"] < 1000]
    with ThreadPoolExecutor(16) as ex:
        champions = sorted(ex.map(lambda r: champion(g, r), rows), key=lambda c: c["name"])

    ids = [i for i, s in g.items_summary.items() if i < 10000 and i not in SKIP_ITEMS and s.get("inStore")
           and s["priceTotal"] >= 2200]
    items = [it for it in (g.item(i) for i in ids) if it and (it["haste"] or it["values"].get("UltimateHaste"))]
    items += [it for it in (g.item(i) for i in EXTRA_ITEMS) if it]
    for it in items:
        it.pop("calcs", None)
        it["values"] = {k: v for k, v in it["values"].items() if k in ("UltimateHaste", "AHBase")}
    items.sort(key=lambda it: (-(it["haste"] + it["values"].get("UltimateHaste", 0) + it["values"].get("AHBase", 0)), it["name"]))

    augments = [a for a in (g.augment(k) for k in AUGMENTS) if a]
    for name in set(AUGMENTS) - {a["key"] for a in augments}:
        print("skipping missing augment", name)
    for a in augments:
        a.pop("calcs", None)
    write_data_js(os.path.join(HERE, "data.js"), "COOLDOWN_DATA",
                  {"patch": g.version, "channel": g.ch, "champions": champions, "items": items, "augments": augments})
    print(f"{g.version}: {len(champions)} champions, {len(items)} items, {len(augments)} augments")


if __name__ == "__main__":
    main()
