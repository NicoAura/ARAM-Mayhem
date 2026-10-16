"""Build data.js for the Speed Cap Breaker tool from CommunityDragon.

Usage: python3 build_data.py [--channel latest|pbe]
Writes data.js next to this script: every champion's base Move Speed and attack range, the items
with Move Speed (plain stats and passives) and the Mayhem augments that add Move Speed.
Python 3 standard library only.
"""
import argparse, os, sys
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
from cdragon import BASE, Game, get, write_data_js  # noqa: E402

SKIP_ITEMS = {4403}  # The Golden Spatula is not buyable in Mayhem
EXTRA_ITEMS = [3041]  # Mejai's costs less than a legendary but its Glory gives Move Speed


def effect(label, kind, value, ranged=None, opt=None, base=None, by_level=None):
    """One source of speed. kind is flat (adds to base), pct (bonus %) or mult (multiplies the total).
    opt is the toggle or number input it depends on; a number input multiplies value (plus base)."""
    e = {"label": label, "kind": kind, "value": round(value, 4)}
    if ranged is not None:
        e["ranged"] = round(ranged, 4)
    if opt:
        e["opt"] = opt
    if base is not None:
        e["base"] = base
    if by_level:
        e["byLevel"] = [round(x, 4) for x in by_level]
    return e


def check(key, label, default=False):
    return {"key": key, "label": label, "type": "check", "def": default}


def number(key, label, default, maximum=None, step=1):
    o = {"key": key, "label": label, "type": "number", "def": default, "step": step}
    if maximum is not None:
        o["max"] = maximum
    return o


def by_level(calc, values):
    """Value of a spell calculation at levels 1 to 18. Supports the part types these augments use."""
    out = []
    for lvl in range(1, 19):
        total = 0.0
        for p in calc.get("mFormulaParts", []):
            t = p.get("__type")
            if t == "NumberCalculationPart":
                total += p.get("mNumber", 0.0)
            elif t == "NamedDataValueCalculationPart":
                total += values.get(p["mDataValue"], 0.0)
            elif t == "ByCharLevelInterpolationCalculationPart":
                a, b = p.get("mStartValue", 0.0), p.get("mEndValue", 0.0)
                total += a + (b - a) * (lvl - 1) / 17
            elif t == "ByCharLevelBreakpointsCalculationPart":
                total += p.get("mLevel1Value", 0.0) + sum(
                    bp.get("mAdditionalBonusAtThisLevel", 0.0) for bp in p.get("mBreakpoints", []) if bp["mLevel"] <= lvl)
            else:
                raise ValueError(f"unsupported calculation part {t}")
        out.append(total)
    return out


def ranged_mult(calc):
    return (calc.get("mRangedMultiplier") or {}).get("mNumber")


def item_effects(g, iid, v):
    """Conditional Move Speed passives and actives, read from the item's data values."""
    calcs = g.items_bin[f"Items/{iid}"].get("mItemCalculations") or {}
    k = str(iid)
    table = {
        3742: lambda: [effect("Shipwrecker at full momentum", "flat", v["MaxMovementSpeed"], opt=check(k + "m", "Dead Man's Plate: full momentum", True))],
        3005: lambda: [effect("Wall Walk, inside a wall", "flat", v["MSBonus"], opt=check(k + "w", "Ghostcrawlers: inside a wall"))],
        3142: lambda: [
            effect("Haunt, out of combat", "flat", v["BaseOOCMS"], ranged=v["BaseOOCMS"] * ranged_mult(calcs["OOCMS"]),
                   opt=check(k + "h", "Youmuu's: out of combat", True)),
            effect("Wraith Step active", "pct", v["MeleeItemCalcValueB"] / 100, ranged=v["RangedItemCalcValueB"] / 100,
                   opt=check(k + "a", "Youmuu's: Wraith Step active")),
        ],
        4629: lambda: [effect("Spelldance after damaging a champion", "flat", calcs["MoveSpeedAmount"]["mFormulaParts"][0]["mNumber"],
                              opt=check(k + "s", "Cosmic Drive: Spelldance", True))],
        3073: lambda: [effect("Overdrive after your Ultimate", "pct", v["BonusMSMelee"] / 100, ranged=v["BonusMSRanged"] / 100,
                              opt=check(k + "o", "Hexplate: after your Ultimate"))],
        3171: lambda: [effect("Noxian Haste", "pct", v["MeleeMS"], ranged=v["MeleeMS"] * v["RangedMSMultiplier"],
                              opt=check(k + "n", "Crimson Lucidity: Noxian Haste", True))],
        6631: lambda: [effect("Breaking Shockwave, peak", "pct", v["ActiveMS"],
                              opt=number(k + "c", "Stridebreaker: champions hit", 0, 5))],
        3139: lambda: [effect("Quicksilver active", "pct", v["MoveSpeed"], opt=check(k + "q", "Mercurial: Quicksilver active"))],
        4401: lambda: [effect("Steadfast at full stacks", "pct", v["MoveSpeed"], opt=check(k + "s", "Force of Nature: full stacks", True))],
        3041: lambda: [effect("10 or more Glory", "pct", v["MoveSpeedMod"], opt=check(k + "g", "Mejai's: 10 or more Glory", True))],
        2065: lambda: [effect("Inspiring Speech active", "pct", v["ActiveMoveSpeed"], opt=check(k + "a", "Shurelya's: active"))],
        2524: lambda: [effect("Fanfare", "flat", v["MoveSpeed"], opt=check(k + "f", "Bandlepipes: Fanfare"))],
        2525: lambda: [effect("Lifeline regeneration", "pct", v["MSAmount"], opt=check(k + "l", "Protoplasm: Lifeline"))],
        3071: lambda: [effect("Fervor after physical damage", "flat", v["MoveSpeedBonus"], opt=check(k + "f", "Black Cleaver: Fervor", True))],
        3078: lambda: [effect("Quicken after attacking", "flat", v["MoveSpeedBonus"], opt=check(k + "q", "Trinity Force: Quicken", True))],
    }
    return table[iid]() if iid in table else []


def augment_effects(g, a):
    """Move Speed from each Mayhem augment, from its data values and spell calculations."""
    v, key = a["values"], a["key"]
    kiwi_aug = next(x for x in g.kiwi.values() if isinstance(x, dict) and x.get("AugmentNameId") == key)
    calcs = g.kiwi[kiwi_aug["RootSpell"]]["mSpell"].get("mSpellCalculations") or {}
    lv = lambda name: by_level(calcs[name], v)  # noqa: E731
    table = {
        "ARAM_LegDay": lambda: [effect(a["name"], "flat", v["MovementSpeed"])],
        "ARAM_WithHaste": lambda: [effect(f"{a['name']} (Ability Haste)", "flat", v["AbilityHasteToMSConversion"],
                                          opt=number(key, "With Haste: your Ability Haste", 100, step=5))],
        "ARAM_TapDancer": lambda: [effect(f"{a['name']} (stacks)", "flat", v["MSPerHit"],
                                          opt=number(key, "Tap Dancer: stacks (attacks in a row)", 20, v["MaxStack"]))],
        "ARAM_ShadowRunner": lambda: [effect(f"{a['name']} after a dash", "flat", v["MSAmount"], opt=check(key, "Shadow Runner: after a dash, blink or stealth"))],
        "Overkill": lambda: [effect(f"{a['name']} (Nails)", "flat", v["MSPerStack"], opt=number(key, "Pin Cushion: Nails detonated", 0))],
        "ARAM_Homeguard": lambda: [effect(a["name"], "pct", v["MovementSpeed"],
                                          ranged=v["MovementSpeed"] * ranged_mult(next(c for c in calcs.values() if c.get("mRangedMultiplier"))),
                                          opt=check(key, "Homeguard: not hit in the last 6 seconds", True))],
        "ARAM_GetExcited": lambda: [effect(f"{a['name']} after a takedown", "pct", v["MSBuff"], opt=check(key, "Get Excited!: after a takedown"))],
        "ARAM_MadScientist": lambda: [effect(f"{a['name']} (tiny)", "pct", v["MovespeedAmp"], opt=check(key, "Mad Scientist: tiny form", True))],
        "ARAM_GiantSlayer": lambda: [effect(a["name"], "pct", v["MovespeedMod"])],
        "ARAM_DrawYourSword": lambda: [effect(a["name"], "pct", v["BonusMS"])],
        "ShrinkEngine": lambda: [effect(f"{a['name']} (stacks)", "pct", v["MoveSpeedAmpPerStack"], opt=number(key, "Shrink Engine: stacks", 10))],
        "SurgeField": lambda: [effect(f"{a['name']} (inside the zone)", "pct", v["ZoneMovementSpeed"], opt=check(key, "Surge Field: inside the zone"))],
        "ARAM_Firefox": lambda: [effect(f"{a['name']} after Autocast", "pct", v["MovementSpeed"], opt=check(key, "FireFox: just after Autocast", True))],
        "Goldrend": lambda: [effect(f"{a['name']} after a hit", "pct", v["PercentMovespeedGain"], opt=check(key, "Goldrend: after hitting a champion"))],
        "KillSecured": lambda: [effect(f"{a['name']} toward low enemies", "pct", v["MovementSpeed"], opt=check(key, "Kill Secured: chasing a low-Health enemy"))],
        "FinalForm": lambda: [effect(f"{a['name']} after your Ultimate", "pct", v["MSBonus"], opt=check(key, "Final Form: after your Ultimate"))],
        "OminousPact": lambda: [effect(f"{a['name']} at low Health", "pct", v["MSMod"], opt=check(key, "Ominous Pact: at 30% Health or lower"))],
        "EscapePlan": lambda: [effect(f"{a['name']} peak", "pct", v["MovespeedModEnhanced"], opt=check(key, "Escape Plan: just triggered"))],
        "ARAM_Upgrade_ZH": lambda: [effect(f"{a['name']} in stasis", "pct", v["UpgradeMS"], opt=check(key, "Upgrade Zhonya's: in stasis"))],
        "Nightstalking": lambda: [effect(f"{a['name']} after a takedown", "pct", v["StealthMoveSpeed"], opt=check(key, "Nightstalking: after a takedown"))],
        "ARAM_EndlessHunt": lambda: [effect(f"{a['name']} (Vitals in a row)", "pct", 0.05, base=v["MS"],
                                            opt=number(key, "En Passant: Vitals hit in a row", 0))],
        "ARAM_DivineDomain": lambda: [effect(f"{a['name']} peak", "pct", lv("Calc_Move_Speed")[0], opt=check(key, "Rite of Ascension: just consumed an Essence"))],
        "ARAM_WeeWooWeeWoo": lambda: [effect(f"{a['name']} toward hurt allies", "pct", lv("Calc_Move_Speed_Max")[0], opt=check(key, "Wee Woo: toward a badly hurt ally"))],
        "PatOnTheBack": lambda: [effect(f"{a['name']} (pats)", "pct", lv("Calc_MS")[0], opt=number(key, "Pat On The Back: allies passed", 0, 4))],
        "ItsGoTime": lambda: [effect(f"{a['name']} active", "pct", 0, by_level=lv("Calc_Move_Speed"), opt=check(key, "It's Go Time: spell active"))],
        "ARAM_Hellbent": lambda: [effect(f"{a['name']} after revive", "pct", 0, by_level=lv("Calc_MoveSpeed"), opt=check(key, "Hellbent: revived, toward enemies"))],
        "ARAM_InfernoTriggered": lambda: [effect(f"{a['name']} (Style rank)", "pct", 0, by_level=lv("Calc_Style_MS_Per_Stack"),
                                                 opt=number(key, "Triggered Inferno: Style rank (F = 1, S = 6)", 0, 6))],
    }
    return table[key]() if key in table else None


def champion(g, row):
    alias = row["alias"]
    b = get(f"{BASE}/{g.ch}/game/data/characters/{alias.lower()}/{alias.lower()}.bin.json")
    root = next(v for k, v in b.items() if k.lower() == f"characters/{alias.lower()}/characterrecords/root")
    val = lambda name: (root.get(name + "Modifiable") or {}).get("baseValue", root.get(name))  # noqa: E731
    return {"alias": alias, "name": row["name"], "icon": g.champion_icon(row["id"]),
            "ms": val("baseMoveSpeed"), "range": val("attackRange")}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--channel", default="latest")
    g = Game(ap.parse_args().channel)

    rows = [r for r in get(f"{g.gd}/champion-summary.json") if 0 < r["id"] < 1000]
    with ThreadPoolExecutor(16) as ex:
        champions = sorted(ex.map(lambda r: champion(g, r), rows), key=lambda c: c["name"])

    items = []
    for iid, s in sorted(g.items_summary.items()):
        b = g.items_bin.get(f"Items/{iid}") or {}
        flat, pct = b.get("mFlatMovementSpeedMod", 0.0), b.get("mPercentMovementSpeedMod", 0.0)
        boots = "Items/ItemGroups/Boots" in b.get("mItemGroups", [])
        if iid >= 10000 or iid in SKIP_ITEMS or not s.get("inStore"):
            continue
        if not (boots or s["priceTotal"] >= 2200 or iid in EXTRA_ITEMS):
            continue
        it = g.item(iid)
        effects = item_effects(g, iid, it["values"]) if it else []
        if not it or not (flat or pct or effects):
            continue
        items.append({"id": iid, "name": it["name"], "price": it["price"], "icon": it["icon"], "limitGroups": it["limitGroups"],
                      "boots": boots, "flat": flat, "pct": round(pct, 4), "effects": effects, "text": it["text"]})
    items.sort(key=lambda i: (not i["boots"], -(i["flat"] + i["pct"] * 350), i["name"]))

    keys = [x["AugmentNameId"] for x in g.kiwi.values() if isinstance(x, dict) and x.get("__type") == "AugmentData"
            and x.get("Enabled") is not False]
    augments = []
    for k in keys:
        a = g.augment(k)
        if not a or not augment_effects(g, a):
            continue
        a["effects"] = augment_effects(g, a)
        a.pop("calcs", None)
        a.pop("values", None)
        augments.append(a)
    augments.sort(key=lambda a: (["Prismatic", "Gold", "Silver"].index(a["tier"]), a["name"]))

    write_data_js(os.path.join(HERE, "data.js"), "SPEED_DATA",
                  {"patch": g.version, "channel": g.ch, "champions": champions, "items": items, "augments": augments})
    print(f"{g.version}: {len(champions)} champions, {len(items)} items, {len(augments)} augments")


if __name__ == "__main__":
    main()
