"""Build data.js for the Heartsteel calculator from CommunityDragon.

Usage: python3 build_data.py [--channel latest|pbe]
Writes data.js next to this script. Python 3 standard library only.
"""
import argparse, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
from cdragon import Game, write_data_js  # noqa: E402

CHAMPIONS = ["Sion", "Chogath", "DrMundo", "Sett", "Ornn", "Maokai", "Zac", "TahmKench", "Nasus",
             "Malphite", "Braum", "Poppy", "KSante", "Gragas", "Volibear", "Galio"]

# Health items. Heartsteel is always in slot one.
ITEMS = [3084, 3083, 3068, 6664, 3075, 3143, 3065, 4401, 6665, 2502, 2504, 3748, 3053, 2501,
         8020, 3742, 6662, 4633, 3071, 6610]

AUGMENTS = ["ARAM_Quest_SteelYourHeart", "ARAM_Goliath", "ARAM_MadScientist", "ARAM_TankEngine",
            "ARAM_CelestialBody", "ARAM_DrawYourSword", "SoulEater"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--channel", default="latest")
    g = Game(ap.parse_args().channel)
    summary = {c["alias"].lower(): c for c in __import__("cdragon").get(f"{g.gd}/champion-summary.json")}

    champions = []
    for alias in CHAMPIONS:
        s = summary[alias.lower()]
        root = g.champion_bin(alias)[f"Characters/{s['alias']}/CharacterRecords/Root"]
        champions.append({"alias": s["alias"], "name": s["name"], "icon": g.champion_icon(s["id"]),
                          "baseHP": root["baseHPModifiable"]["baseValue"],
                          "hpPerLevel": root["hpPerLevelModifiable"]["baseValue"]})

    items = [x for x in (g.item(i) for i in ITEMS) if x]
    augments = [x for x in (g.augment(a) for a in AUGMENTS) if x]
    for name in set(AUGMENTS) - {a["key"] for a in augments}:
        print("skipping missing augment", name)
    write_data_js(os.path.join(HERE, "data.js"), "HEARTSTEEL_DATA",
                  {"patch": g.version, "channel": g.ch, "champions": champions, "items": items, "augments": augments})
    print(f"{g.version}: {len(champions)} champions, {len(items)} items, {len(augments)} augments")


if __name__ == "__main__":
    main()
