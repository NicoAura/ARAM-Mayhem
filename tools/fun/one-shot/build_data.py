"""Build data.js for the One-Shot Checker from CommunityDragon.

Usage: python3 build_data.py [--channel latest|pbe]
Writes data.js next to this script: every champion's base Health, Armor and Magic Resist with growth,
the penetration and damage items, and the Mayhem augments that add penetration or damage.
Python 3 standard library only.
"""
import argparse, os, sys
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
from cdragon import Game, get, write_data_js  # noqa: E402

# Item stats that cut through resists, read straight from each item's record.
PEN_STATS = {"PhysicalLethality": "lethality", "mPercentArmorPenetrationMod": "armorPen",
             "mFlatMagicPenetrationMod": "magicPenFlat", "mPercentMagicPenetrationMod": "magicPen"}
# Items without penetration whose passive shreds resists or adds damage: Black Cleaver, Abyssal Mask,
# Riftmaker, Liandry's Torment and Spear of Shojin.
EXTRA_ITEMS = [3071, 8020, 4633, 6653, 3161]
# Data values the calculator reads. Everything else is dropped to keep data.js small.
KEEP_VALUES = {"ShredPerStack", "MaxStacks", "DamageAmp", "PenPerHit", "MaxBonusDamagePercent", "MaxBonusHealth",
               "ExecuteThreshold", "EternityDamageIncreaseMax", "DamageIncreaseMax", "SpellDamageIncrease",
               "StackCount", "AbilityDamageRangeMod", "ChargeBase", "ChargeLethalityRatio"}

AUGMENTS = ["ARAM_ThreadtheNeedle", "ARAM_Erosion", "BurstingTeeth", "GlassCannon", "ARAM_LittleDevil",
            "ARAM_GiantSlayer", "BrushPower", "ARAM_FromBeginningToEnd", "ARAM_BacktoBasics", "ARAM_Overflow",
            "ARAM_DontBlink", "ARAM_Dropkick"]


def stat(root, key):
    v = root.get(key, 0.0)
    return v.get("baseValue", 0.0) if isinstance(v, dict) else v


def champion(g, row):
    root = g.champion_bin(row["alias"]).get(f"Characters/{row['alias']}/CharacterRecords/Root") or {}
    stats = {"hp": "baseHPModifiable", "hpG": "hpPerLevelModifiable", "ar": "baseArmorModifiable",
             "arG": "armorPerLevelModifiable", "mr": "baseMR", "mrG": "mrPerLevel"}
    return {"alias": row["alias"], "name": row["name"], "icon": g.champion_icon(row["id"]),
            **{k: round(stat(root, f), 3) for k, f in stats.items()}}


def item(g, iid):
    it = g.item(iid)
    if not it:
        return None
    b = g.items_bin[f"Items/{iid}"]
    for k, name in PEN_STATS.items():
        it[name] = round(b.get(k, 0.0), 4)
    if iid == 2520:  # Bastionbreaker's Shaped Charge: flat true damage + a Lethality ratio
        parts = b["mItemCalculations"]["AbilityDamageCalc"]["mFormulaParts"]
        it["values"]["ChargeBase"] = sum(p.get("mNumber", 0.0) for p in parts if p["__type"] == "NumberCalculationPart")
        it["values"]["ChargeLethalityRatio"] = sum(p.get("mCoefficient", 0.0) for p in parts if p["__type"] == "StatByCoefficientCalculationPart")
    for k in ("calcs", "ap", "mana", "haste"):
        it.pop(k, None)
    it["values"] = {k: round(v, 4) for k, v in it["values"].items() if k in KEEP_VALUES and v is not None}
    return it


def augment(g, key):
    a = g.augment(key)
    if not a:
        return None
    root = g.kiwi[next(v["RootSpell"] for v in g.kiwi.values() if isinstance(v, dict) and v.get("AugmentNameId") == key)]
    sc = root["mSpell"].get("mSpellCalculations") or {}
    if key == "BurstingTeeth":  # Lethality and Magic Penetration per Tooth come from a buff counter ratio
        for name in ("LethalityPerTooth", "MPenPerTooth"):
            a["values"][name] = sc[name]["mFormulaParts"][0]["mCoefficient"]
    if key == "GlassCannon":  # ranged champions get a fraction of the true damage
        a["values"]["RangedMultiplier"] = round(sc["TrueDamagePercSplit"]["mRangedMultiplier"]["mNumber"], 4)
    if key == "ARAM_Dropkick":  # only the flat part of the execute threshold; the stat ratios are labeled in the page
        a["values"]["ExecuteBase"] = sum(p.get("mNumber", 0.0) for p in sc["Calc_Execute_Threshold"]["mFormulaParts"]
                                         if p["__type"] == "NumberCalculationPart")
    a["values"] = {k: round(v, 4) for k, v in a["values"].items()}
    return a


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--channel", default="latest")
    g = Game(ap.parse_args().channel)

    rows = [r for r in get(f"{g.gd}/champion-summary.json") if 0 < r["id"] < 1000]
    with ThreadPoolExecutor(16) as ex:
        champions = sorted(ex.map(lambda r: champion(g, r), rows), key=lambda c: c["name"])

    # Store items for normal games only: ids < 10000, sold in the shop, not Feats boots.
    ids = [i for i, s in g.items_summary.items() if i < 10000 and s.get("inStore") and s.get("displayInItemSets")
           and not s.get("requiredBuffCurrencyName") and any(g.items_bin.get(f"Items/{i}", {}).get(k) for k in PEN_STATS)]
    items = [it for it in (item(g, i) for i in ids + EXTRA_ITEMS) if it]
    pen = lambda it: it["lethality"] + 100 * (it["armorPen"] + it["magicPen"]) + it["magicPenFlat"]
    items.sort(key=lambda it: (-pen(it), it["name"]))

    augments = [a for a in (augment(g, k) for k in AUGMENTS) if a]
    for name in set(AUGMENTS) - {a["key"] for a in augments}:
        print("skipping missing augment", name)
    for a in augments:
        if a["key"] != "ARAM_Overflow":  # Overflow keeps its Mana calculation
            a.pop("calcs", None)
    write_data_js(os.path.join(HERE, "data.js"), "ONESHOT_DATA",
                  {"patch": g.version, "channel": g.ch, "champions": champions, "items": items, "augments": augments})
    print(f"{g.version}: {len(champions)} champions, {len(items)} items, {len(augments)} augments")


if __name__ == "__main__":
    main()
