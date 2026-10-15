"""Build data.js for the Infinite Ryze calculator from CommunityDragon.

Usage: python3 build_data.py [--channel latest|pbe]
Writes data.js next to this script. Python 3 standard library only.
"""
import argparse, json, os, re, urllib.request

BASE = "https://raw.communitydragon.org"
HERE = os.path.dirname(os.path.abspath(__file__))

# Items worth putting on an AP / mana / health Ryze. Wooglet's Witchcap comes from a Mayhem quest augment.
ITEMS = [3040, 3003, 3089, 228002, 6657, 2503, 3118, 6655, 2522, 4633, 3041, 3121, 3119, 3110,
         3157, 3102, 3135, 3137, 4645, 4646, 6653, 3116, 4629, 3165, 3100, 3128, 4628, 3152,
         4010, 3802, 1058]

# Mayhem augments that change Ryze's AP, mana or health, or how hard his abilities hit.
AUGMENTS = ["ARAM_WitchfulThinking", "OminousPact", "ARAM_Goliath", "HandOfBaron", "ARAM_MadScientist",
            "ARAM_ADAPt", "ARAM_PhenomenalEvil", "ARAM_MasterofDuality", "ARAM_SlapAround", "MightyShield",
            "ARAM_ImTheJuggernaut", "ARAM_MindtoMatter", "ARAM_Overflow", "ARAM_Quest_WoogletsWitchcap"]


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "aram-mayhem-ryze-calculator"})
    with urllib.request.urlopen(req, timeout=300) as r:
        return json.load(r)


def asset_url(channel, path):
    """Turn a game asset path (.tex/.dds or /lol-game-data/assets/...) into a CommunityDragon PNG URL."""
    p = path.lower()
    if p.startswith("/lol-game-data/assets/"):
        return f"{BASE}/{channel}/plugins/rcp-be-lol-game-data/global/default/" + p[len("/lol-game-data/assets/"):]
    return f"{BASE}/{channel}/game/" + re.sub(r"\.(tex|dds)$", ".png", p)


def clean(text):
    text = re.sub(r"<br\s*/?>", " ", text or "")
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", text)).strip()


MANA_PARTS = {"NumberCalculationPart", "NamedDataValueCalculationPart", "AbilityResourceByCoefficientCalculationPart"}


def calcs(spell_calcs, values):
    """Keep the simple calculations: a flat number, or a value that grows from level 1 to 18."""
    out = {}
    for name, c in (spell_calcs or {}).items():
        parts = c.get("mFormulaParts") or []
        if len(parts) == 1 and parts[0].get("__type") == "ByCharLevelInterpolationCalculationPart":
            out[name] = {"lvl1": parts[0].get("mStartValue", 0.0), "lvl18": parts[0].get("mEndValue", 0.0)}
        elif parts and all(p.get("__type") in MANA_PARTS for p in parts):
            # flat + mana ratio, e.g. Overflow's 10% + 0.5% per 100 max Mana
            flat = sum(p.get("mNumber", 0.0) for p in parts if p["__type"] == "NumberCalculationPart")
            for p in parts:
                if p["__type"] == "NamedDataValueCalculationPart":
                    flat += values.get(p["mDataValue"], 0.0)
            ratio = [p for p in parts if p["__type"] == "AbilityResourceByCoefficientCalculationPart"]
            if ratio:
                out[name] = {"flat": flat, "manaRatio": ratio[0].get("mCoefficient", 0.0),
                             "bonusOnly": ratio[0].get("mStatFormula") == 2,
                             "multiplier": (c.get("mMultiplier") or {}).get("mNumber", 1.0)}
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--channel", default="latest")
    ch = ap.parse_args().channel
    gd = f"{BASE}/{ch}/plugins/rcp-be-lol-game-data/global/default/v1"
    version = get(f"{BASE}/{ch}/content-metadata.json")["version"].split("+")[0]
    strings = get(f"{BASE}/{ch}/game/en_us/data/menu/en_us/lol.stringtable.json")["entries"]
    items_summary = {i["id"]: i for i in get(f"{gd}/items.json")}
    items_bin = get(f"{BASE}/{ch}/game/items.cdtb.bin.json")
    kiwi = get(f"{BASE}/{ch}/game/maps/modespecificdata/kiwi.bin.json")
    ryze = get(f"{BASE}/{ch}/game/data/characters/ryze/ryze.bin.json")

    # Ryze
    root = ryze["Characters/Ryze/CharacterRecords/Root"]
    par = root["primaryAbilityResource"]
    passive = ryze["Characters/Ryze/Spells/RyzePassiveAbility/RyzePassive"]["mSpell"]
    pdv = {d["name"]: d["values"][1] for d in passive["DataValues"]}
    spells = {}
    for key, path in (("Q", "RyzeQWrapperAbility/RyzeQWrapper"), ("W", "RyzeWAbility/RyzeW"), ("E", "RyzeEAbility/RyzeE")):
        sp = ryze[f"Characters/Ryze/Spells/{path}"]["mSpell"]
        dv = {d["name"]: d.get("values", [0] * 7)[1:6] for d in sp.get("DataValues", [])}
        calc = next(c for n, c in sp["mSpellCalculations"].items() if n.endswith("DamageCalc"))
        ap_ratio = next(p["mCoefficient"] for p in calc["mFormulaParts"] if p["__type"] == "StatByCoefficientCalculationPart")
        mana_ratio = next(p["mCoefficient"] for p in calc["mFormulaParts"] if p["__type"] == "AbilityResourceByCoefficientCalculationPart")
        spells[key] = {"base": dv["BaseDamage"], "apRatio": round(ap_ratio, 4), "bonusManaRatio": round(mana_ratio, 4)}
    champion = {
        "name": "Ryze",
        "icon": f"{BASE}/{ch}/plugins/rcp-be-lol-game-data/global/default/v1/champion-icons/13.png",
        "baseHP": root["baseHPModifiable"]["baseValue"], "hpPerLevel": root["hpPerLevelModifiable"]["baseValue"],
        "baseMana": par["{726ee5cd}"]["baseValue"], "manaPerLevel": par["{6216bf7b}"]["baseValue"],
        "passiveManaPctPer100AP": pdv["PercentManaIncrease"] / 100, "passiveAPStep": pdv["APAmount"],
        "spells": spells,
    }

    # Items, with ARAM / Mayhem (Kiwi) data overrides applied
    items = []
    for iid in ITEMS:
        b, s = items_bin.get(f"Items/{iid}"), items_summary.get(iid)
        if not b or not s:
            print("skipping missing item", iid)
            continue
        dv = {d["mName"]: d["mValue"] for d in b.get("mDataValues", []) if "mValue" in d}
        for mode in ("ARAM", "Kiwi"):
            for d in (b.get("DataValuesModeOverride") or {}).get(mode, {}).get("DataValues", []):
                dv[d["mName"]] = d["mValue"]
        items.append({
            "id": iid, "name": s["name"], "price": s["priceTotal"],
            "icon": asset_url(ch, s["iconPath"]),
            "ap": b.get("mFlatMagicDamageMod", 0.0), "mana": b.get("flatMPPoolMod", 0.0),
            "hp": b.get("mFlatHPPoolMod", 0.0), "haste": b.get("mAbilityHasteMod", 0.0),
            "values": dv, "calcs": calcs(b.get("mItemCalculations"), dv),
            "limitGroups": [g for g in b.get("mItemGroups", []) if (items_bin.get(g) or {}).get("mMaxGroupOwnable") == 1],
            "text": clean(s["description"])[:400],
        })

    # Augments
    augs_by_id = {v["AugmentNameId"]: v for v in kiwi.values() if isinstance(v, dict) and v.get("__type") == "AugmentData"}
    augments = []
    for name in AUGMENTS:
        a = augs_by_id.get(name)
        if not a:
            print("skipping missing augment", name)
            continue
        sp = kiwi.get(a["RootSpell"], {}).get("mSpell", {})
        dv = {d["name"]: d["values"][0] for d in sp.get("DataValues", []) if d.get("values")}
        augments.append({
            "key": name, "id": a["AugmentPlatformId"],
            "name": strings.get(a["NameTra"].lower(), name),
            "tier": ["Silver", "Gold", "Prismatic"][a.get("rarity", 0)],
            "icon": asset_url(ch, a["AugmentSmallIconPath"]),
            "values": dv, "calcs": calcs(sp.get("mSpellCalculations"), dv),
            "text": clean(strings.get(a["AugmentTooltipTra"].lower(), "")),
        })

    data = {"patch": version, "channel": ch, "champion": champion, "items": items, "augments": augments}
    with open(os.path.join(HERE, "data.js"), "w") as f:
        f.write("// Generated by build_data.py from CommunityDragon. Do not edit by hand.\n")
        f.write("window.RYZE_DATA = " + json.dumps(data, indent=1, ensure_ascii=False) + ";\n")
    print(f"{version}: {len(items)} items, {len(augments)} augments")


if __name__ == "__main__":
    main()
