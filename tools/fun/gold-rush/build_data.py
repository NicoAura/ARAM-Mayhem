"""Build data.js for the Gold Rush tool from CommunityDragon.

Usage: python3 build_data.py [--channel latest|pbe]
Writes data.js next to this script: Mayhem's income numbers (starting gold, passive gold, kill and
minion gold), every legendary item and pair of boots in the Mayhem shop, and the Mayhem augments
that give gold. Python 3 standard library only.
"""
import argparse, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
from cdragon import BASE, Game, get, write_data_js  # noqa: E402

# Gold augments and how each one pays. "needs" lists the items the augment upgrades: Mayhem only
# offers an Upgrade augment once you own that item, so it pays from that item's finish onward.
AUGMENTS = {
    "Goldrend": {"kind": "hits"},
    "BloodMoneyBurn": {"kind": "burn"},
    "ARAM_YowchMyCoins": {"kind": "coins"},
    "ARAM_FromBeginningToEnd": {"kind": "firstStrike"},
    "Donation": {"kind": "instant"},
    "ARAM_Upgrade_Immolate": {"kind": "immolate", "needs": [3068, 6664]},
    "ARAM_Upgrade_Collector": {"kind": "execute", "needs": [6676]},
    "ARAM_Upgrade_IE": {"kind": "instant", "needs": [3031]},
    "ARAM_Upgrade_Sheen": {"kind": "instant", "needs": "sheen"},
    "Upgrade_DeathDance": {"kind": "instant", "needs": [6333]},
    "Upgrade_SunderedSky": {"kind": "instant", "needs": [6610]},
    "Upgrade_Ravenous": {"kind": "instant", "needs": [3074]},
    "ARAM_Quest_WoogletsWitchcap": {"kind": "free", "free": 1058},  # Needlessly Large Rod right away
    "ARAM_Quest_VoidImmolation": {"kind": "free", "free": 6660},  # Bami's Cinder right away
}
SHEEN = 3057
SKIP_ITEMS = {4403, 8010}  # The Golden Spatula is not buyable in Mayhem; 8010 is a second Bloodletter's Curse


def kiwi_mode(g):
    """Starting gold, passive gold and kill gold from the Kiwi mode of the Howling Abyss (map 12)."""
    m = get(f"{BASE}/{g.ch}/game/data/maps/shipping/map12/map12.bin.json")
    mode = m["Maps/Shipping/Map12/Modes/KIWI"]
    consts = {}
    for grp in m[mode["mGameModeConstants"]]["mGroups"].values():
        for k, v in grp.get("mConstants", {}).items():
            consts[k] = v.get("mValue")
    kill = next(m[c] for c in mode["Configs"] if "BaseGold" in m.get(c, {}))
    shop = set()
    for lst in mode["itemLists"]:
        shop |= {int(p.split("/")[1]) for p in m[lst]["mItems"]}
    minions = {}
    for kind in ("melee", "ranged", "siege"):
        b = get(f"{BASE}/{g.ch}/game/data/characters/ha_chaosminion{kind}/ha_chaosminion{kind}.bin.json")
        root = next(v for v in b.values() if isinstance(v, dict) and "goldGivenOnDeath" in v)
        minions[kind] = root["goldGivenOnDeath"]
    income = {
        "startingGold": consts["ai_StartingGold"],
        "passiveGold": consts["ai_AmbientGoldAmount"], "passiveInterval": consts["ai_AmbientGoldInterval"],
        "passiveStart": consts["mission_AmbientGoldStartTime"],
        "killGold": kill["BaseGold"][0], "firstBlood": kill["FirstBloodBonus"], "minionGold": minions,
    }
    return income, shop


def parts(summary, iid):
    """Every component inside an item, all the way down (a list, so doubles count twice)."""
    out = []
    for c in summary.get(iid, {}).get("from", []):
        out += [c] + parts(summary, c)
    return out


def augment_gold(a, sp_calcs):
    """One-off gold an augment gives: a data value, a Gold calculation, or the 'Gain N Gold' tooltip line."""
    v = a["values"]
    for k in ("GoldAmount", "InstantGoldGain", "Gold"):
        if k in v:
            return v[k]
    nums = [p.get("mNumber") for p in (sp_calcs.get("Gold") or {}).get("mFormulaParts", []) if "mNumber" in p]
    if nums:
        return nums[0]
    m = re.search(r"Gain (\d+) Gold", a["text"], re.I)
    return float(m.group(1)) if m else 0.0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--channel", default="latest")
    g = Game(ap.parse_args().channel)
    income, shop = kiwi_mode(g)
    summary = g.items_summary

    ids = [i for i in shop if i < 10000 and i not in SKIP_ITEMS and i in summary and summary[i].get("inStore")
           and ((not summary[i].get("to") and summary[i]["priceTotal"] >= 2000)
                or ("Boots" in summary[i]["categories"] and summary[i]["priceTotal"] > 300))]
    items = []
    for it in (g.item(i) for i in ids):
        if not it:
            continue
        items.append({"id": it["id"], "name": it["name"], "price": it["price"], "icon": it["icon"],
                      "boots": "Boots" in summary[it["id"]]["categories"], "parts": parts(summary, it["id"]),
                      "limitGroups": it["limitGroups"], "text": it["text"]})
    items.sort(key=lambda it: (not it["boots"], it["name"]))

    augments = []
    for key, how in AUGMENTS.items():
        a = g.augment(key)
        if not a:
            print("skipping missing augment", key)
            continue
        root = next(v for v in g.kiwi.values() if isinstance(v, dict) and v.get("AugmentNameId") == key)
        sp_calcs = g.kiwi.get(root["RootSpell"], {}).get("mSpell", {}).get("mSpellCalculations") or {}
        a.update(kind=how["kind"], gold=augment_gold(a, sp_calcs))
        needs = how.get("needs")
        a["needs"] = summary[SHEEN]["to"] if needs == "sheen" else (needs or [])
        if how.get("free"):
            f = summary[how["free"]]
            a["free"] = {"id": f["id"], "name": f["name"], "price": f["priceTotal"]}
            if f["name"].lower() not in a["text"].lower():
                print(f"warning: {key} tooltip does not mention {f['name']}")
        if key == "Goldrend":  # TotalGoldPerProcTooltip = GoldPerProc x TotalLoops
            a["values"]["GoldPerHit"] = a["values"]["GoldPerProc"] * a["values"]["TotalLoops"]
        if key == "ARAM_FromBeginningToEnd":
            cd = sp_calcs.get("Cooldown", {}).get("mFormulaParts", [{}])[0].get("mPart1", {})
            a["calcs"]["Cooldown"] = {"lvl1": cd.get("mStartValue"), "lvl18": cd.get("mEndValue")}
        augments.append(a)

    write_data_js(os.path.join(HERE, "data.js"), "GOLD_DATA",
                  {"patch": g.version, "channel": g.ch, "income": income, "items": items, "augments": augments})
    print(f"{g.version}: {len(items)} items, {len(augments)} augments, income {income}")


if __name__ == "__main__":
    main()
