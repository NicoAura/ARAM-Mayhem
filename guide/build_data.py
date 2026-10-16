"""Build data.js for the Mayhem Guide tab from CommunityDragon (the League client's own files).

Usage: python3 guide/build_data.py [--channel latest|pbe]
Needs: pip install xxhash (string-table keys are hashed). Writes guide/data.js.

What it reads:
  game/maps/modespecificdata/kiwi.bin.json      Mayhem quests (ModesQuestData), augments, augment data values
  game/en_us/data/menu/en_us/lol.stringtable.json  quest, augment and milestone text
  v1/challenges.json                            the permanent ARAM challenges and their tier thresholds
  v1/queues.json, v1/game-mode-mutators.json    Mayhem queues and the Howling Abyss map skins
  v1/items.json, v1/augment-lists.json          Mayhem-only items, augment pool sizes
"""
import argparse, json, os, re, sys, time, urllib.error, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(HERE), "tools", "datamine"))
from strings import key_hash  # noqa: E402

BASE = "https://raw.communitydragon.org"
TIERS = ["Silver", "Gold", "Prismatic"]
MAYHEM_QUEUE = 2400
CHALLENGE_TIERS = ["IRON", "BRONZE", "SILVER", "GOLD", "PLATINUM", "DIAMOND", "MASTER", "GRANDMASTER", "CHALLENGER"]
# Map skins: game-mode-mutators names them, the minimap file is per skin
MAP_SKINS = [
    ("Howling Abyss", None, "2dlevelminimap.png"),
    ("Koeshin's Crossing", "MapSkin_Map12_Bloom", "2dlevelminimap_bloom.png"),
    ("Butcher's Bridge", "MapSkin_HA_Bilgewater", "2dlevelminimap_bilgewater2.png"),
    ("Bridge of Progress", "MapSkin_HA_Crepe", "2dlevelminimap_crepe.png"),
]
SUMMONS = [
    ("Poro King", "kiwi_poroking", "kiwi_poroking_circle.png", "A Mayhem version of the Poro King, with its own King Poro model in blue and red team colors."),
    ("Tibbers", "kiwi_tibbers", "bear_circle.png", "A Mayhem copy of Annie's bear. Its spell is named \"Summon: Tibbers\"."),
    ("Viego Soul", "kiwi_viegosoul", "kiwi_viegosoul_circle.png", "A Mayhem companion unit that reuses Senna's soul model."),
]
# Augment Sets (an earlier Mayhem season's feature; the text is still in the client): string-table key stem per set
AUGMENT_SETS = [
    ("Snowball", "Snowday", ""),
    ("Ambulance", "Wee Woo Wee Woo", "Gain Movement Speed and Heal and Shield Power toward allies at low Health."),
    ("Money", "Make it Rain", ""),
    ("Gamble", "High Roller", "Minions can drop Stat Anvils, and more of the set raises the chance of Gold or Prismatic Anvils."),
    ("Stacking", "Stackosaurus Rex", ""),
    ("FullyAutomated", "Fully Automated", "Lowers your Autocast cooldown, and at the next tier Autocast cooldown scales with Ability Haste."),
    ("Firecracker", "Firecracker Set", ""),
    ("DiveBomb", "Dive Bomb Set", "Reduces your death timer."),
    ("Mana", "Archmage", ""),
]
# Augments that hand you an extra summoner spell
SPELL_AUGMENTS = ["PoroCharge_Active", "DimensionShift_Active", "Flash2"]
MAYHEM_ITEMS = [550001, 550002, 550003, 550004, 550006, 550005, 550007, 226668, 223069]


def get(url, tries=4):
    # CommunityDragon refuses Python's default User-Agent
    req = urllib.request.Request(url, headers={"User-Agent": "deeparam-guide"})
    for attempt in range(tries):
        try:
            with urllib.request.urlopen(req, timeout=300) as r:
                return json.load(r)
        except (urllib.error.URLError, ConnectionError):
            if attempt == tries - 1:
                raise
            time.sleep(2 ** attempt)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--channel", default="latest")
    ch = ap.parse_args().channel
    gd = f"{BASE}/{ch}/plugins/rcp-be-lol-game-data/global/default"

    def asset(path):
        """A game or client asset path as a CommunityDragon PNG URL."""
        p = path.lower()
        if p.startswith("/lol-game-data/assets/"):
            return f"{gd}/{p[len('/lol-game-data/assets/'):]}"
        return f"{BASE}/{ch}/game/" + re.sub(r"\.(tex|dds)$", ".png", p)

    version = get(f"{BASE}/{ch}/content-metadata.json")["version"].split("+")[0]
    kiwi = get(f"{BASE}/{ch}/game/maps/modespecificdata/kiwi.bin.json")
    entries = get(f"{BASE}/{ch}/game/en_us/data/menu/en_us/lol.stringtable.json")["entries"]

    def s(key, default=""):
        if not key:
            return default
        return entries.get(key.lower()) or entries.get(key_hash(key)) or default

    pool = {x["modeName"]: x["augmentList"] for x in get(f"{gd}/v1/augment-lists.json")}
    in_pool = set(pool.get("KIWI", []))

    # ---- Quests: each ModesQuestData belongs to one augment that points at it
    augments = {k: v for k, v in kiwi.items() if isinstance(v, dict) and v.get("__type") == "AugmentData"}
    quests = []
    for qpath, q in kiwi.items():
        if not (isinstance(q, dict) and q.get("__type") == "ModesQuestData"):
            continue
        apath, a = next(((k, v) for k, v in augments.items() if qpath in json.dumps(v)), (None, None))
        values = {}
        if a:
            sp = kiwi.get(a.get("RootSpell"), {}).get("mSpell", {})
            values = {d["name"].lower(): d["values"][0] for d in sp.get("DataValues", []) if d.get("values")}
        milestones, notes = [], []
        for i, m in enumerate(q.get("Milestones", [])):
            parts = split_quest(fill(s(m.get("MilestoneDescriptionTra")), values, m.get("{7fec0982}"), i + 1))
            milestones.append({"need": m.get("{7fec0982}"), "quest": parts["quest"], "reward": parts["reward"]})
            notes += [n for n in parts["notes"] if n not in notes]
        quests.append({
            "key": q["QuestName"],
            "name": s(q.get("QuestNameTra"), q["QuestName"]),
            "augmentId": a.get("AugmentPlatformId") if a else None,
            "tier": TIERS[a.get("rarity", 0)] if a else None,
            "inPool": apath in in_pool,
            "icon": asset(q["QuestIcon"]["texturePath"]) if q.get("QuestIcon") else None,
            "milestones": milestones,
            "notes": notes[:3],
        })
    quests.sort(key=lambda q: (not q["inPool"], TIERS.index(q["tier"]) if q["tier"] else 9, q["name"]))

    # ---- ARAM challenges: the permanent 101xxx group (seasonal copies have ended)
    data = get(f"{gd}/v1/challenges.json")["challenges"]
    groups, challenges = {}, []
    for cid, c in data.items():
        if not cid.startswith("101") or c.get("seasons"):
            continue
        if c.get("tags", {}).get("isCapstone") == "Y":
            groups[cid] = c["name"]
            continue
        th = c["thresholds"]
        tiers = [{"tier": t, "value": th[t]["value"], "reward": any(r.get("category") == "TITLE" for r in th[t].get("rewards", []))}
                 for t in CHALLENGE_TIERS if t in th]
        top = tiers[-1]["tier"]
        challenges.append({
            "id": int(cid), "name": c["name"], "text": c["description"], "group": c.get("tags", {}).get("parent"),
            "mayhem": MAYHEM_QUEUE in (c.get("queueIds") or []), "tiers": tiers,
            "icon": asset(c["levelToIconPath"].get(top) or next(iter(c["levelToIconPath"].values()))),
        })
    for c in challenges:
        c["group"] = groups.get(c["group"], "ARAM")
    challenges.sort(key=lambda c: c["id"])

    # ---- Mode facts
    queues = get(f"{gd}/v1/queues.json")
    queues = queues.values() if isinstance(queues, dict) else queues
    mayhem_queues = sorted({q["id"]: q["name"] for q in queues if str(q.get("name", "")).startswith("ARAM: Mayhem")}.items())
    mutators = get(f"{gd}/v1/game-mode-mutators.json")
    skin_names = {m["Mutator"]["ExpandedMutator"]: m["MapNameOverride"] for g in mutators for m in g.get("Mutators", [])}
    maps = [{"name": skin_names.get(mut, name) if mut else name,
             "minimap": f"{BASE}/{ch}/game/assets/maps/info/map12/{file}"} for name, mut, file in MAP_SKINS]

    items_by_id = {i["id"]: i for i in get(f"{gd}/v1/items.json")}
    items = []
    for iid in MAYHEM_ITEMS:
        it = items_by_id.get(iid)
        if not it:
            continue
        desc = s(f"GeneratedTip_Item_{iid}_ExternalDescription") if "GeneratedTip" in it["description"] else it["description"]
        items.append({"id": iid, "name": it["name"], "icon": asset(it["iconPath"]), "text": clean(desc)[:220]})

    tier_counts = {t: 0 for t in TIERS}
    for path in in_pool:
        a = kiwi.get(path)
        if a and a.get("Enabled") is not False:
            tier_counts[TIERS[a.get("rarity", 0)]] += 1

    summons = [{"name": n, "text": t, "icon": f"{BASE}/{ch}/game/assets/characters/{folder}/hud/{icon}"}
               for n, folder, icon, t in SUMMONS]

    # ---- Mode rules from map12.bin
    m12 = get(f"{BASE}/{ch}/game/data/maps/shipping/map12/map12.bin.json")
    consts = {v["mName"]: {k: c.get("mValue") for k, c in v.get("mConstants", {}).items()}
              for v in m12.values() if isinstance(v, dict) and v.get("mName", "").startswith("Kiwi_Balance")}
    spells = {p.split("/")[-1]: v for p, v in m12.items() if "/Spells/" in p and isinstance(v, dict)}
    def dv(name):
        return {d["name"]: d["values"][0] for d in (spells.get(name, {}).get("mSpell") or {}).get("DataValues", []) if d.get("values")}
    def tip(name):
        keys = ((spells.get(name, {}).get("mBuff") or {}).get("mTooltipData") or {}).get("mLocKeys") or {}
        return clean(s(keys.get("keyTooltip")))
    combo = tip("Kiwi_ComboBreaker")
    levels = [int(x) for x in re.findall(r"\d+", (re.search(r"Level\s*([\d/]+)", combo) or [None, ""])[1])]
    rules = {
        "augmentLevels": levels,
        "rerolls": dv("ARAM_Augment_Manager").get("InitialReroll"),
        "comboBreakerTenacity": dv("Kiwi_ComboBreaker").get("TenacityAmp"),
        "balance": consts.get("Kiwi_Balance", {}),
        "onFire": {"text": tip("Kiwi_OnFireBuff"), "values": dv("Kiwi_OnFireBuff")},
    }

    # ---- Summoner spells allowed in Mayhem, and augments that add one
    allowed = [{"name": x["name"], "cooldown": x["cooldown"], "text": x["description"], "icon": asset(x["iconPath"])}
               for x in get(f"{gd}/v1/summoner-spells.json") if "KIWI" in x.get("gameModes", [])]
    allowed.sort(key=lambda x: x["name"])
    by_key = {v["AugmentNameId"]: v for v in augments.values()}
    spell_augments = []
    for key in SPELL_AUGMENTS:
        a = by_key.get(key)
        if a:
            spell_augments.append({"name": s(a["NameTra"], key), "id": a.get("AugmentPlatformId"),
                                   "tier": TIERS[a.get("rarity", 0)], "icon": asset(a["AugmentSmallIconPath"]),
                                   "text": strip_unknown(s(a.get("DescriptionTra")).split('"')[0])})

    # ---- Items with Mayhem (or ARAM) values that differ from Summoner's Rift
    items_bin = get(f"{BASE}/{ch}/game/items.cdtb.bin.json")
    item_changes = []
    for path, b in items_bin.items():
        o = (b.get("DataValuesModeOverride") or {}) if isinstance(b, dict) else {}
        mode = "Kiwi" if "Kiwi" in o else "ARAM" if "ARAM" in o else None
        iid = path.split("/")[-1]
        # ids above 100000 are other modes' copies of an item; keep the normal one
        if not mode or not iid.isdigit() or int(iid) >= 100000 or int(iid) not in items_by_id:
            continue
        base = {d["mName"]: d.get("mValue") for d in b.get("mDataValues", [])}
        diffs = [{"name": d["mName"], "rift": base.get(d["mName"]), "mayhem": d.get("mValue")}
                 for d in o[mode].get("DataValues", []) if base.get(d["mName"]) != d.get("mValue")]
        if diffs and not any(c["id"] == int(iid) for c in item_changes):
            it = items_by_id[int(iid)]
            item_changes.append({"id": int(iid), "name": it["name"], "icon": asset(it["iconPath"]), "changes": diffs})
    item_changes.sort(key=lambda x: x["name"])

    # ---- Archive: Augment Sets
    sets = []
    for stem, fallback, fallback_bonus in AUGMENT_SETS:
        k = f"Kiwi_Augment_Set_{stem}_"
        raw = s(k + "Tracker") or s(k + "Tacker") or s(k + "Description")
        bonus = clean(raw).removeprefix("Set Bonus").strip()
        if "@" in bonus or not bonus:
            bonus = fallback_bonus or strip_unknown(bonus)
        sets.append({"name": s(k + "Name") or fallback, "bonus": bonus})

    out = {
        "patch": version,
        "hero": f"{gd}/assets/leagueclient/gamemodeassets/kiwi/kiwi-tutorial-set2.png",
        "queues": [{"id": i, "name": n} for i, n in mayhem_queues],
        "augmentCounts": tier_counts, "maps": maps, "summons": summons, "items": items,
        "quests": quests, "challenges": challenges, "rules": rules, "spells": allowed,
        "spellAugments": spell_augments, "itemChanges": item_changes, "augmentSets": sets,
    }
    with open(os.path.join(HERE, "data.js"), "w") as f:
        # no header comment: the file ships to the site, and pages don't say where data comes from
        f.write("window.GUIDE_DATA = " + json.dumps(out, indent=1, ensure_ascii=False) + ";\n")
    print(f"{version}: {len(quests)} quests, {len(challenges)} challenges "
          f"({sum(c['mayhem'] for c in challenges)} count Mayhem), {len(items)} items, pool {tier_counts}")


def fill(text, values, need, tier):
    """Fill a quest tooltip's @Name@ placeholders from the augment's data values; unknown ones become "?"."""
    def rep(m):
        name, mult = m.group(1), 1.0
        if "*" in name:
            name, factor = name.split("*", 1)
            try:
                mult = float(factor)
            except ValueError:
                pass
        key = name.lower()
        if key == "questrequirement" and need is not None:
            v = need
        elif key == "questtier":
            v = tier
        elif key == "spellname":
            return "{{SpellName}}"
        elif key in values:
            v = values[key] * mult
        else:
            return "?"
        return f"{v:g}"
    text = re.sub(r"@([A-Za-z0-9_.*]+)@", rep, text or "")
    text = re.sub(r"your \{\{ ?SpellName ?\}\}", "your chosen ability", text)
    text = re.sub(r"\{\{ ?SpellName ?\}\}", "your chosen ability", text)
    return clean(text)


def split_quest(text):
    """Split a milestone tooltip into the quest, its reward and any other lasting notes.
    Lines that show live progress ("Poros Fed: ?/12") or current state (anything with an unknown "?") are dropped."""
    out = {"quest": "", "reward": "", "notes": []}
    for para in re.split(r"\n\s*\n", text):
        lines = [l.strip() for l in para.split("\n") if l.strip()]
        if lines and lines[0].upper().startswith(("QUEST:", "REWARD:")):
            # keep the line, drop just the unknown number ("dealing ? damage" -> "dealing damage")
            lines = [re.sub(r"\s*\?(?=[\s%.,]|$)", "", l) for l in lines if not re.search(r":\s*\?", l)]
        else:
            lines = [l for l in lines if "?" not in l]
        para = re.sub(r"\s+([.,])", r"\1", " ".join(lines))
        if not para:
            continue
        if para.upper().startswith("QUEST:"):
            out["quest"] = para[6:].strip()
        elif para.upper().startswith("REWARD:"):
            out["reward"] = para[7:].strip()
        elif out["quest"] and (para.startswith('"') or " - " in para):
            out["notes"].append(para)
    return out


def strip_unknown(text):
    """Game text with its @placeholders@ dropped, for strings whose numbers aren't in the client data."""
    text = re.sub(r"\s*@[^@]+@\s*%?", " ", text or "")
    return re.sub(r"\s+([.,%)])", r"\1", clean(text)).replace("  ", " ").strip()


def clean(text):
    text = re.sub(r"<br\s*/?>", "\n", text or "")
    text = re.sub(r"<[^>]+>", "", text)
    return re.sub(r"[ \t]+", " ", re.sub(r"\n{3,}", "\n\n", text)).strip()


if __name__ == "__main__":
    main()
