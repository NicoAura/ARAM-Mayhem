"""Build data.js for the Biggest Champion tool from CommunityDragon.

Usage: python3 build_data.py [--channel latest|pbe]
Writes data.js next to this script: every champion's selection radius, Baron Nashor's, the items and
Mayhem augments that change size, and the champion abilities with a size value. Python 3 standard library only.
"""
import argparse, os, sys
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
from cdragon import Game, get, write_data_js  # noqa: E402

DEFAULT_COLLISION = 65.0  # gameplay collision radius when a character record does not override it

# Heartsteel (size per 1000 max Health), Sterak's Gage and Protoplasm Harness (size while their Lifeline is up).
# Gargoyle Stoneplate also has SizeIncrease but is not in the store. Cappa Juice has PercentSizeIncrease but its
# tooltip says it does nothing, so it is left out.
ITEMS = [3084, 2525, 3053]
SIZE_VALUES = ("SizeAmount", "HealthSizeThreshold", "SizeCap", "SizeIncrease")

AUGMENTS = ["ARAM_Goliath", "ARAM_MadScientist", "ARAM_TankEngine", "GrowthSpurt", "DimensionShift_Active",
            "ARAM_ImTheJuggernaut", "ShrinkEngine", "ARAM_GiantSlayer"]
# Size values that live in a spell calculation instead of a data value: augment -> (calculation, value name).
AUG_CALCS = {"ARAM_ImTheJuggernaut": ("Calc_Size", "SizePerLevel"), "DimensionShift_Active": ("SelfScaleIncrease", "SelfScaleIncrease")}

# Champion abilities with a real size value: alias, spell, data value, label, ranks (R has 3).
GROWTH = [
    ("Nasus", "NasusR", "SizeIncreasePercent", "R · Fury of the Sands", 3),
    ("Belveth", "BelvethR", "SizeIncreasePercent", "R · Endless Banquet (true form)", 3),
    ("Shyvana", "ShyvanaR", "SizeScaling", "R · Dragon Form", 3),
    ("Trundle", "TrundlePain", "ScaleModelAmount", "R · Subjugate", 1),
]


def spell(bin_, name):
    return next((v["mSpell"] for k, v in bin_.items() if k.endswith("/" + name) and isinstance(v, dict) and v.get("mSpell")), {})


def values(sp, name):
    return next((d["values"] for d in sp.get("DataValues", []) if d["name"] == name), None)


def number_calc(sp, name):
    parts = ((sp.get("mSpellCalculations") or {}).get(name) or {}).get("mFormulaParts") or []
    return sum(p.get("mNumber", 0.0) for p in parts if p.get("__type") == "NumberCalculationPart")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--channel", default="latest")
    g = Game(ap.parse_args().channel)

    rows = [r for r in get(f"{g.gd}/champion-summary.json") if 0 < r["id"] < 1000]

    def champion(r):
        root = g.champion_bin(r["alias"])[f"Characters/{r['alias']}/CharacterRecords/Root"]
        return {"alias": r["alias"], "name": r["name"], "icon": g.champion_icon(r["id"]),
                "radius": root.get("selectionRadius", 100.0),
                "collision": root.get("overrideGameplayCollisionRadius") or DEFAULT_COLLISION}

    with ThreadPoolExecutor(16) as ex:
        champions = sorted(ex.map(champion, rows), key=lambda c: c["name"])

    baron = g.champion_bin("SRU_Baron")["Characters/SRU_Baron/CharacterRecords/Root"]
    baron = {"name": "Baron Nashor", "radius": baron["selectionRadius"],
             "collision": baron.get("overrideGameplayCollisionRadius") or DEFAULT_COLLISION}

    growth = []
    for alias, name, value, label, ranks in GROWTH:
        v = values(spell(g.champion_bin(alias), name), value)
        if v:  # index 0 is rank 0, so ranks 1-3 are indices 1-3
            growth.append({"champion": alias, "key": name, "label": label, "ranks": [round(x, 4) for x in v[1:ranks + 1]]})
        else:
            print("skipping missing growth", alias, name)
    feast = spell(g.champion_bin("Chogath"), "Feast")
    chogath = {"healthPerStack": values(feast, "RHealthPerStack")[1:4], "minionMaxStacks": values(feast, "RMinionMaxStacks")[1]}

    items = [x for x in (g.item(i) for i in ITEMS) if x]
    for it in items:
        it.pop("calcs", None)
        it["values"] = {k: round(v, 4) for k, v in it["values"].items() if k in SIZE_VALUES}

    augments = [a for a in (g.augment(k) for k in AUGMENTS) if a]
    for name in set(AUGMENTS) - {a["key"] for a in augments}:
        print("skipping missing augment", name)
    kiwi_aug = {v["AugmentNameId"]: v for v in g.kiwi.values() if isinstance(v, dict) and v.get("__type") == "AugmentData"}
    for a in augments:
        a.pop("calcs", None)
        if a["key"] in AUG_CALCS:
            calc, as_name = AUG_CALCS[a["key"]]
            a["values"][as_name] = number_calc(g.kiwi[kiwi_aug[a["key"]]["RootSpell"]]["mSpell"], calc)
        a["values"] = {k: round(v, 4) for k, v in a["values"].items()}

    write_data_js(os.path.join(HERE, "data.js"), "SIZE_DATA",
                  {"patch": g.version, "channel": g.ch, "baron": baron, "champions": champions, "growth": growth,
                   "chogath": chogath, "items": items, "augments": augments})
    print(f"{g.version}: {len(champions)} champions, {len(growth)} growth abilities, {len(items)} items, {len(augments)} augments")


if __name__ == "__main__":
    main()
