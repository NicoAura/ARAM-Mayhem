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


def site_paths(text):
    """Point asset URLs at the site's own copies (/assets/cd/<channel>/<path, lower case>)."""
    return re.sub(re.escape(BASE) + r"/([^\s\"']+)", lambda m: "/assets/cd/" + m.group(1).lower(), text)


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
    # The Mayhem aura's tooltip lists the mode-wide rules; the mode's own settings hold the numbers behind some
    modes = {k.split("/")[-1]: v for k, v in m12.items() if k.startswith("Maps/Shipping/Map12/Modes/")}
    def mode_consts(mode):
        groups = (m12.get(modes.get(mode, {}).get("mGameModeConstants"), {}) or {}).get("mGroups", {})
        return {k: c.get("mValue") for g in groups.values() if isinstance(g, dict)
                for k, c in (g.get("mConstants") or {}).items() if isinstance(c, dict)}
    kiwi_consts, aram_consts = mode_consts("KIWI"), mode_consts("ARAM")
    aura = re.sub(r"<titleLeft>.*?</titleLeft>|<postScriptLeft>.*?</postScriptLeft>|\{\{[^}]*\}\}", "", s("buff_desc_MayhemicMagic"))
    aura = [l.strip() for l in clean(aura).split("\n") if l.strip()]
    # each selection's card count per rarity sits in the mode's augment config
    pick = next((c for c in (m12.get(k) for k in modes.get("KIWI", {}).get("Configs", [])) if isinstance(c, dict)
                 and isinstance(c.get("{8794a0e6}"), dict)), {})
    cards_per = sorted(set(pick.get("{8794a0e6}", {}).values())) or [3]
    rules = {
        "aura": aura,
        # attacks can't come faster than this delay, so 1 / delay is the attack speed cap
        "attackSpeedCap": round(1 / kiwi_consts["gcd_AttackMinDelay"], 2) if kiwi_consts.get("gcd_AttackMinDelay") else None,
        "aramAttackSpeedCap": round(1 / aram_consts["gcd_AttackMinDelay"], 2) if aram_consts.get("gcd_AttackMinDelay") else None,
        "critOverflow": "adaptive" if any(re.search(r"Excess Critical Strike Chance .*Adaptive Force", l) for l in aura) else None,
        "runes": not kiwi_consts.get("SuppressRunesMasteriesPerks"),
        "cards": cards_per[-1],
        "augmentLevels": levels,
        "rerolls": dv("ARAM_Augment_Manager").get("InitialReroll"),
        "comboBreakerTenacity": dv("Kiwi_ComboBreaker").get("TenacityAmp"),
        "balance": consts.get("Kiwi_Balance", {}),
        "onFire": {"text": tip("Kiwi_OnFireBuff"), "values": dv("Kiwi_OnFireBuff")},
    }

    # ---- Summoner spells allowed in Mayhem, and augments that add one
    summoner_spells = get(f"{gd}/v1/summoner-spells.json")
    allowed = [{"name": x["name"], "cooldown": x["cooldown"], "text": x["description"], "icon": asset(x["iconPath"])}
               for x in summoner_spells if "KIWI" in x.get("gameModes", [])]
    allowed.sort(key=lambda x: x["name"])
    by_key = {v["AugmentNameId"]: v for v in augments.values()}
    spell_augments = []
    for key in SPELL_AUGMENTS:
        a = by_key.get(key)
        if a:
            spell_augments.append({"name": s(a["NameTra"], key), "id": a.get("AugmentPlatformId"),
                                   "tier": TIERS[a.get("rarity", 0)], "icon": asset(a["AugmentSmallIconPath"]),
                                   "text": strip_unknown(s(a.get("DescriptionTra")).split('"')[0])})

    def expand(t):
        """Pull in strings referenced by key ({{ Some_Key }}) and drop inline icon tokens (%i:name%)."""
        t = re.sub(r"\{\{\s*spellname\s*\}\}", "{{SpellName}}", t or "", flags=re.I)
        for _ in range(3):
            t = re.sub(r"\{\{\s*(?!SpellName\b)([A-Za-z0-9_]+)\s*\}\}", lambda m: s(m.group(1)), t)
        return re.sub(r"%i:[A-Za-z0-9_]+%\s*", "", t)

    # ---- Live augments' text, for the rules below
    live = []
    for path in sorted(in_pool):
        a = kiwi.get(path)
        if a and a.get("Enabled") is not False:
            sp = (kiwi.get(a.get("RootSpell")) or {}).get("mSpell") or {}
            values = {d["name"].lower(): d["values"][0] for d in sp.get("DataValues") or [] if d.get("values")}
            text = " ".join(fill(expand(s(a.get("DescriptionTra"))), values, None, None).split())
            text = " ".join(x for x in re.split(r"(?<=[.!])\s+", text) if not re.search(r"\?(?=[\s%.,/)s]|$)", x))
            raw_tip = expand(s(a.get("AugmentTooltipTra")) or s(a.get("DescriptionTra")))
            tip = fill(raw_tip, values, None, None)
            # a sentence with a number the client doesn't hold (a live counter or a formula) is dropped, not half-shown
            tip = "\n".join(" ".join(x for x in re.split(r"(?<=[.!])\s+", l) if not re.search(r"\?(?=[\s%.,/)]|$)", x)).strip()
                            for l in tip.split("\n"))
            if "{{" in tip:  # a pulled-in string the client doesn't have: use the short description instead
                tip = text
            grants = re.findall(r"<spellName>([^<]+)</spellName>", raw_tip)
            m = re.search(r"Gain the (.+?) Keystone Runes?", text)
            if m:
                grants = [r.strip() for r in re.split(r",| and ", m.group(1)) if r.strip()] + grants
            nums = {}
            for d in sp.get("DataValues") or []:
                v = [round(x, 4) for x in d.get("values") or [] if x is not None]
                if v:
                    nums[d["name"]] = v[0] if len(set(v)) == 1 else v
            live.append({"id": a.get("AugmentPlatformId"), "name": s(a["NameTra"], a["AugmentNameId"]),
                         "tier": TIERS[a.get("rarity", 0)], "icon": asset(a["AugmentSmallIconPath"]), "text": text,
                         "tooltip": re.sub(r"\n{3,}", "\n\n", tip).strip(), "grants": list(dict.fromkeys(grants)),
                         "values": nums})
    live.sort(key=lambda a: (TIERS.index(a["tier"]), a["name"]))
    brief = lambda a: {k: a[k] for k in ("id", "name", "tier", "icon", "text")}  # noqa: E731

    # ---- Champion select: no rune page, so keystones only come from augments; spells regular ARAM has but Mayhem lacks
    keystones = []
    for a in live:
        m = re.search(r"Gain the (.+?) Keystone Runes?", a["text"])
        if m:
            keystones.append({**brief(a), "runes": [r.strip() for r in re.split(r",| and ", m.group(1)) if r.strip()]})
    champ_select = {
        "runes": rules["runes"],
        "keystoneAugments": keystones,
        "notInMayhem": sorted(x["name"] for x in summoner_spells
                              if "ARAM" in x.get("gameModes", []) and "KIWI" not in x.get("gameModes", [])),
    }

    # ---- Augments that change your selections: an extra augment, a random one in its place, or more rerolls
    selection_augments = [brief(a) for a in live if re.search(r"random (?:Silver |Gold |Prismatic )?Augment|reroll", a["text"], re.I)]
    golden_reroll = {"name": s("Kiwi_Golden_Reroll_Tooltip_Title"), "text": clean(s("Kiwi_Golden_Reroll_Tooltip_Desc")),
                     "icon": asset("/lol-game-data/assets/ASSETS/Rewards/Kiwi/GoldenReroll.png")}

    # ---- Items with Mayhem (or ARAM) values that differ from Summoner's Rift
    items_bin = get(f"{BASE}/{ch}/game/items.cdtb.bin.json")
    item_changes = []
    for path, b in items_bin.items():
        o = (b.get("DataValuesModeOverride") or {}) if isinstance(b, dict) else {}
        iid = path.split("/")[-1]
        # ids above 100000 are other modes' copies of an item; keep the normal one
        if not ("Kiwi" in o or "ARAM" in o) or not iid.isdigit() or int(iid) >= 100000 or int(iid) not in items_by_id:
            continue
        base = {d["mName"]: d.get("mValue") for d in b.get("mDataValues", [])}
        mayhem = {}
        for mode in ("ARAM", "Kiwi"):  # Kiwi (Mayhem) is applied on top of the ARAM layer
            mayhem.update({d["mName"]: d.get("mValue") for d in (o.get(mode) or {}).get("DataValues", [])})
        diffs = [{"name": k, "rift": base.get(k), "mayhem": v} for k, v in mayhem.items() if base.get(k) != v]
        if diffs and not any(c["id"] == int(iid) for c in item_changes):
            it = items_by_id[int(iid)]
            item_changes.append({"id": int(iid), "name": it["name"], "icon": asset(it["iconPath"]), "changes": diffs})
    item_changes.sort(key=lambda x: x["name"])

    # ---- Items that live augments hand out. "reward" items (quest rewards, combined items) can't be bought, so
    # build stats should leave them out; "free" items are given at once but are also sold in the shop.
    names = {}
    for it in items_by_id.values():
        n = re.sub(r"<[^>]+>", "", it["name"]).strip()
        if len(n) > 3:
            names.setdefault(n, []).append(it["id"])
    granted = {}
    for path in sorted(in_pool):
        a = kiwi.get(path)
        if not a or a.get("Enabled") is False:
            continue
        text = " ".join(clean(s(a.get("DescriptionTra")) + " . " + s(a.get("AugmentTooltipTra"))).split())
        for n, ids in names.items():
            name = re.escape(n) + r"(?![\w'])"
            if re.search(r"(?:REWARD|Reward):\s*(?:Gain\s+(?:an?\s+)?)?" + name + r"|combine into\s+" + name, text):
                how = "reward"
            elif re.search(r"(?<!QUEST: )\b[Gg]ain\s+an?\s+" + name, text):
                how = "free"
            else:
                continue
            for iid in ids:
                if granted.get(iid, {}).get("how") != "reward":
                    granted[iid] = {"id": iid, "name": n, "how": how, "icon": asset(items_by_id[iid]["iconPath"]),
                                    "augmentId": a.get("AugmentPlatformId"), "augment": s(a["NameTra"], a["AugmentNameId"]),
                                    "augmentTier": TIERS[a.get("rarity", 0)]}
    granted = sorted(granted.values(), key=lambda g: (g["how"] != "reward", g["name"], g["id"]))

    # ---- Augment selections: when they come, what one shows, and the chance a given augment is in it
    cards = rules["cards"]  # each selection shows this many augments of one rarity, and each slot can be rerolled
    rerolls = int(rules["rerolls"] or 0)
    odds = {t: {"pool": n, "offer": round(min(1, cards / n), 4) if n else 0,
                "withRerolls": round(min(1, cards * (1 + rerolls) / n), 4) if n else 0}
            for t, n in tier_counts.items()}
    tier_of = {a["AugmentPlatformId"]: TIERS[a.get("rarity", 0)] for p, a in augments.items()
               if p in in_pool and a.get("Enabled") is not False}
    augment_rules = {"patch": version, "levels": rules["augmentLevels"], "cards": cards, "rerollsPerSlot": rerolls,
                     "odds": odds, "tiers": {str(k): v for k, v in sorted(tier_of.items())}, "grantedItems": granted,
                     "selectionAugments": selection_augments, "goldenReroll": golden_reroll}

    # ---- Mayhem progression track. The event hub has each track's dates and level count; the client's reward list
    # holds every track's rewards in order, one per level, so the current track is the last block of Mayhem rewards.
    track = build_track(gd, asset, augments, s)
    unlocks = {r["augmentId"]: r["level"] for r in (track["levels"] if track else []) if r.get("augmentId")}
    augment_rules["unlocks"] = {str(k): v for k, v in sorted(unlocks.items())}

    # ---- Every live augment's full text, what it grants, its numbers and its track level, for the augment pages
    details = {str(a["id"]): {**{k: a[k] for k in ("name", "tier", "text", "tooltip", "grants", "values")},
                              "unlockLevel": unlocks.get(a["id"])} for a in live}
    with open(os.path.join(HERE, "augment_details.json"), "w") as f:
        f.write(site_paths(json.dumps({"patch": version, "augments": details}, indent=1, ensure_ascii=False)) + "\n")

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
        "augmentRules": {k: v for k, v in augment_rules.items() if k != "tiers"},
        "champSelect": champ_select,
        "track": track,
    }
    # mode-wide numbers the simulator and site pages use
    mode_rules = {"patch": version, "attackSpeedCap": rules["attackSpeedCap"], "aramAttackSpeedCap": rules["aramAttackSpeedCap"],
                  "critOverflow": rules["critOverflow"], "runes": rules["runes"], "aura": rules["aura"],
                  "keystoneAugments": {str(a["id"]): a["runes"] for a in keystones}}
    with open(os.path.join(HERE, "mode_rules.json"), "w") as f:
        json.dump(mode_rules, f, indent=1, ensure_ascii=False)
        f.write("\n")
    # the same rules plus each augment's rarity, for the site's augment pages and build tables
    with open(os.path.join(HERE, "augment_rules.json"), "w") as f:
        json.dump(augment_rules, f, indent=1, ensure_ascii=False)
        f.write("\n")
    with open(os.path.join(HERE, "data.js"), "w") as f:
        # no header comment: the file ships to the site, and pages don't say where data comes from
        f.write("window.GUIDE_DATA = " + site_paths(json.dumps(out, indent=1, ensure_ascii=False)) + ";\n")
    print(f"{version}: {len(quests)} quests, {len(challenges)} challenges "
          f"({sum(c['mayhem'] for c in challenges)} count Mayhem), {len(items)} items, pool {tier_counts}")


def build_track(gd, asset, augments, s):
    """The current Mayhem progression track: name, dates and what each level gives (augment, emote, icon or other)."""
    events = [e["event"] for e in get(f"{gd}/v1/event-hub.json")
              if e.get("event", {}).get("seasonPassSubType") == "kMayhem"]
    if not events:
        return None
    ev = max(events, key=lambda e: e["startDate"])
    size = max((c.get("chapterEnd", 0) for c in ev.get("chapters", [])), default=0)
    def image(r):
        first = ((r or {}).get("rewards") or [None])[0] or {}
        return (first.get("media") or {}).get("image") or ""
    rewards = get(f"{gd}/v1/rewards.json")
    mayhem = [i for i, r in enumerate(rewards) if re.search(r"/Kiwi/|/AramMayhem/", image(r))]
    if not size or not mayhem or mayhem[-1] + 1 < size:
        return None
    block = rewards[mayhem[-1] + 1 - size: mayhem[-1] + 1]
    if sum(1 for r in block if re.search(r"/Kiwi/|/AramMayhem/", image(r))) < size / 2:
        return None  # the list's layout changed; don't guess
    by_icon = {}
    for a in augments.values():
        stem = a["AugmentLargeIconPath"].split("/")[-1].lower().split(".")[0].removesuffix("_large")
        by_icon.setdefault(stem, a)
        by_icon.setdefault(a["AugmentNameId"].lower().removeprefix("aram_").removesuffix("_active"), a)
    emotes = {e["inventoryIcon"].split("/")[-1].lower(): e for e in get(f"{gd}/v1/summoner-emotes.json") if e.get("inventoryIcon")}
    icons = {str(i["id"]): i for i in get(f"{gd}/v1/summoner-icons.json")}
    words = lambda n: re.sub(r"(?<=[a-z])(?=[A-Z])", " ", n)  # noqa: E731
    levels = []
    for n, r in enumerate(block, 1):
        img = image(r)
        f = img.split("/")[-1]
        stem = f.lower().split(".")[0].removesuffix("_large").removeprefix("augment_").removeprefix("quest")
        # the site's asset paths swap "kiwi" for "mayhem", so a file whose real path says "mayhem" can't be mirrored
        row = {"level": n, "icon": asset(img) if img and "mayhem" not in img.lower() else None}
        if "/Augments/" in img or "/Augment_" in img:
            a = by_icon.get(stem)
            row.update(kind="Augment", name=s(a["NameTra"], a["AugmentNameId"]) if a else words(f.split(".")[0]),
                       augmentId=a.get("AugmentPlatformId") if a else None, tier=TIERS[a.get("rarity", 0)] if a else None)
        elif "SummonerEmotes" in img:
            row.update(kind="Emote", name=(emotes.get(f.lower()) or {}).get("name") or words(f.split(".")[0]))
        elif "SummonerIcons" in img:
            row.update(kind="Icon", name=(icons.get(f.split(".")[0]) or {}).get("title") or "Profile icon")
        elif "Achievement_Title" in img:
            row.update(kind="Title", name="A title")
        else:
            name = s("Kiwi_Golden_Reroll_Tooltip_Title") if stem == "goldenreroll" else words(f.split(".")[0])
            row.update(kind="Reward", name=name)
        levels.append(row)
    return {"name": ev.get("localizedName"), "start": ev["startDate"][:10], "end": ev.get("progressEndDate", ev["endDate"])[:10],
            "size": size, "levels": levels}


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
