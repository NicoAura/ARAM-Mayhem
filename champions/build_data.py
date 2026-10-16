"""Build data.js for the Champions tab from the League client's own files (via CommunityDragon).

Usage: python3 champions/build_data.py [--channel latest|pbe]
Writes champions/data.js. Python 3 standard library only. Champion files are cached in
~/.cache/deeparam-champions/<patch>/ so a rebuild on the same patch is quick.

What it reads:
  v1/champion-summary.json, v1/champions/{id}.json   names, titles, roles, splash, ability text and icons, pick quote
  game/data/characters/{alias}/{alias}.bin.json      base stats, Mayhem ability changes (DataValuesModeOverride and
                                                     the cooldown override, ARAM then Kiwi), Riot's ARAM item suggestions
  v1/items.json, v1/cherry-augments.json             item and augment names and icons
And from this repo (already on the site): data/cn/champions.csv (Tier List stats) and
simulator/viewer/replay-data/best-builds.json (the Simulator's best build per champion).

Not in the client: the per-champion damage dealt/taken, tenacity, healing and ability haste
adjustments. Riot applies those on the game server, so this page doesn't show them.
"""
import argparse, csv, json, os, re, time, urllib.error, urllib.request
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
BASE = "https://raw.communitydragon.org"
CACHE = os.path.join(os.path.expanduser("~"), ".cache", "deeparam-champions")
SLOTS = ["Q", "W", "E", "R", "P"]
RANKS = {"Q": 5, "W": 5, "E": 5, "R": 3}
MODES = ("ARAM", "Kiwi")  # Kiwi is Mayhem; it is applied on top of the ARAM layer
COOLDOWN_OVERRIDE = "{f9c2333e}"  # per-mode cooldownTime override (unhashed name unknown)
STATS = [  # (key, CharacterRecord field)
    ("hp", "baseHPModifiable"), ("hpPerLevel", "hpPerLevelModifiable"),
    ("ad", "baseDamageModifiable"), ("adPerLevel", "damagePerLevelModifiable"),
    ("armor", "baseArmorModifiable"), ("armorPerLevel", "armorPerLevelModifiable"),
    ("mr", "baseMR"), ("mrPerLevel", "mrPerLevel"),
    ("attackSpeed", "attackSpeedModifiable"), ("range", "attackRangeModifiable"), ("moveSpeed", "baseMoveSpeedModifiable"),
]


def get(url, cache=None, tries=4):
    if cache and os.path.exists(cache):
        with open(cache) as f:
            return json.load(f)
    # CommunityDragon refuses Python's default User-Agent
    req = urllib.request.Request(url, headers={"User-Agent": "deeparam-champions"})
    for attempt in range(tries):
        try:
            with urllib.request.urlopen(req, timeout=300) as r:
                data = r.read()
            break
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            if attempt == tries - 1:
                raise
        except (urllib.error.URLError, ConnectionError):
            if attempt == tries - 1:
                raise
        time.sleep(2 ** attempt)
    if cache:
        os.makedirs(os.path.dirname(cache), exist_ok=True)
        with open(cache, "wb") as f:
            f.write(data)
    return json.loads(data)


def clean(text):
    text = re.sub(r"<br\s*/?>", "\n", text or "")
    return re.sub(r"<[^>]+>", "", text).replace("&nbsp;", " ").strip()


def same(a, b):
    return all(abs(x - y) < 1e-4 for x, y in zip(a, b)) and len(a) == len(b)


def ranks(values, slot):
    """The values a player sees: rank 1..max for abilities (index 0 is rank 0), level 1 on for the passive."""
    vals = [round(v, 4) for v in values[1:] if v is not None]
    if slot in RANKS:
        vals = vals[:RANKS[slot]]
    return vals


def mayhem_changes(bin_, record):
    """Every number Mayhem changes in this champion's abilities, as (slot, label, rift ranks, mayhem ranks)."""
    # spells lists the Q, W, E and R spells in order; each ability's sub-spells live in the same folder
    folders = {sp.rsplit("/", 1)[0]: SLOTS[i] for i, sp in enumerate((record.get("spells") or [])[:4])}
    mains = set((record.get("spells") or [])[:4])
    passive = record.get("mCharacterPassiveSpell") or ""
    if passive:
        folders.setdefault(passive.rsplit("/", 1)[0], "P")

    def slot(path):
        for f, s in folders.items():
            if path.startswith(f + "/"):
                return s
        return None

    out, seen = [], set()
    # main spells first, so a sub-spell repeating the same change (Ashe's Volley ranks) is dropped
    for path, obj in sorted(bin_.items(), key=lambda kv: (kv[0] not in mains and kv[0] != passive, kv[0])):
        sp = obj.get("mSpell") if isinstance(obj, dict) else None
        if not isinstance(sp, dict):
            continue
        s = slot(path)
        if not s:
            continue
        rows = []
        base = {d["name"]: d.get("values") for d in sp.get("DataValues") or [] if d.get("values")}
        merged = {}
        for mode in MODES:
            for d in ((sp.get("DataValuesModeOverride") or {}).get(mode) or {}).get("SpellDataValues") or []:
                if d.get("values"):
                    merged[d["name"]] = d["values"]
        for name, vals in merged.items():
            if name in base and not same(base[name], vals):
                rows.append((name, base[name], vals))
        cd = sp.get(COOLDOWN_OVERRIDE) or {}
        cd_vals = next(((cd.get(m) or {}).get("value") for m in reversed(MODES) if (cd.get(m) or {}).get("value")), None)
        if cd_vals and sp.get("cooldownTime") and not same(sp["cooldownTime"], cd_vals):
            rows.append(("Cooldown", sp["cooldownTime"], cd_vals))
        for name, rift, mayhem in rows:
            r, m = ranks(rift, s), ranks(mayhem, s)
            key = (s, name, tuple(m))
            if key in seen or r == m:
                continue
            seen.add(key)
            out.append({"slot": s, "name": name, "rift": r, "mayhem": m})
    out.sort(key=lambda c: (SLOTS.index(c["slot"]), c["name"] != "Cooldown", c["name"]))
    return out


def aram_build(bin_):
    """Riot's suggested ARAM build (the item recommendations the shop shows on Howling Abyss)."""
    for obj in bin_.values():
        if not (isinstance(obj, dict) and obj.get("__type") == "ItemRecommendationOverrideSet"):
            continue
        for o in obj.get("mOverrides") or []:
            if any(c.get("mMapID") == 12 and c.get("mModeNameStringId") == "ARAM" for c in o.get("mOverrideContexts") or []):
                ids = lambda xs: [int(x.split("/")[-1]) for x in xs if x.split("/")[-1].isdigit()]  # noqa: E731
                return {
                    "start": [ids(b.get("items") or []) for b in o.get("StartingItemBundles") or []],
                    "core": [ids(r.get("items") or []) for r in o.get("mRecItemRanges") or []],
                }
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--channel", default="latest")
    ch = ap.parse_args().channel
    gd = f"{BASE}/{ch}/plugins/rcp-be-lol-game-data/global/default"

    def asset(path):
        p = (path or "").lower()
        if not p:
            return None
        if p.startswith("/lol-game-data/assets/"):
            return f"{gd}/{p[len('/lol-game-data/assets/'):]}"
        return f"{BASE}/{ch}/game/" + re.sub(r"\.(tex|dds)$", ".png", p)

    version = get(f"{BASE}/{ch}/content-metadata.json")["version"].split("+")[0]
    cache = os.path.join(CACHE, f"{ch}-{version}")
    # ids 60000+ are the Jade copies of champions (another mode)
    summary = [c for c in get(f"{gd}/v1/champion-summary.json") if 0 < c["id"] < 10000]
    print(f"patch {version}: {len(summary)} champions")

    def load(c):
        alias = c["alias"].lower()
        return (get(f"{gd}/v1/champions/{c['id']}.json", os.path.join(cache, f"{c['id']}.json")),
                get(f"{BASE}/{ch}/game/data/characters/{alias}/{alias}.bin.json", os.path.join(cache, f"{alias}.bin.json")))

    with ThreadPoolExecutor(12) as pool:
        loaded = list(pool.map(load, summary))

    items = {i["id"]: i for i in get(f"{gd}/v1/items.json")}
    augs = {a["id"]: a for a in get(f"{gd}/v1/cherry-augments.json")}

    tier = {}
    path = os.path.join(REPO, "data", "cn", "champions.csv")
    if os.path.exists(path):
        with open(path, newline="") as f:
            rows = list(csv.DictReader(f))
        for r in rows:
            tier[int(r["champion_id"])] = {
                "rank": int(r["rank"]), "of": len(rows), "winRate": float(r["win_rate"]), "pickRate": float(r["pick_rate"]),
                "damage": float(r["avg_damage_ratio"]), "tank": float(r["avg_tank_ratio"]),
            }

    sim, sim_items, sim_augs = {}, {}, {}
    try:
        with open(os.path.join(REPO, "simulator", "viewer", "replay-data", "best-builds.json")) as f:
            best = json.load(f)["champions"]
        with open(os.path.join(REPO, "simulator", "data", "items.json")) as f:
            sim_items = json.load(f)["items"]
        with open(os.path.join(REPO, "simulator", "data", "augments.json")) as f:
            sim_augs = json.load(f)["augments"]
        for b in best:
            sim[b["champion"].lower()] = {
                "items": [sim_items[k]["id"] for k in b["build"]["items"] if k in sim_items],
                "augments": [sim_augs[k]["id"] for k in b["build"]["augments"] if k in sim_augs],
                "dps": b["summary"].get("mean_dps"),
            }
    except (OSError, KeyError) as e:
        print("no Simulator builds:", e)

    used_items, used_augs, champions = set(), set(), []
    for c, (info, bin_) in zip(summary, loaded):
        if not info:
            continue
        bin_ = bin_ or {}
        record = next((v for k, v in bin_.items() if k.endswith("/CharacterRecords/Root")), {})
        base_skin = next((s for s in info.get("skins") or [] if s.get("isBase")), {})
        abilities = [{"slot": "P", "name": info["passive"]["name"], "icon": asset(info["passive"].get("abilityIconPath")),
                      "text": clean(info["passive"].get("description"))}]
        for s in info.get("spells") or []:
            abilities.append({"slot": s["spellKey"].upper(), "name": s["name"], "icon": asset(s.get("abilityIconPath")),
                              "text": clean(s.get("description")), "cooldown": ranks([0] + s.get("cooldownCoefficients", []), s["spellKey"].upper())})
        build = aram_build(bin_)
        if build:
            used_items.update(i for g in build["start"] + build["core"] for i in g)
        sb = sim.get(c["alias"].lower())
        if sb:
            used_items.update(sb["items"])
            used_augs.update(sb["augments"])
        stats = {k: round(record[f]["baseValue"], 3) for k, f in STATS if isinstance(record.get(f), dict) and "baseValue" in record[f]}
        champions.append({
            "id": c["id"], "alias": c["alias"], "name": info["name"], "title": info.get("title", ""),
            "roles": info.get("roles") or [], "bio": info.get("shortBio", ""),
            "icon": asset(info.get("squarePortraitPath")),
            "splash": asset(base_skin.get("uncenteredSplashPath") or base_skin.get("splashPath")),
            "tile": asset(base_skin.get("tilePath")),
            "vo": asset(info.get("chooseVoPath")),
            "stats": stats,
            "abilities": abilities,
            "mayhem": mayhem_changes(bin_, record) if record else [],
            "aramBuild": build,
            "tier": tier.get(c["id"]),
            "sim": sb,
        })
    champions.sort(key=lambda c: c["name"])

    out = {
        "patch": version, "channel": ch,
        "champions": champions,
        "items": {i: {"name": items[i]["name"], "icon": asset(items[i]["iconPath"])} for i in sorted(used_items) if i in items},
        "augments": {a: {"name": augs[a]["nameTRA"], "icon": asset(augs[a].get("augmentSmallIconPath"))} for a in sorted(used_augs) if a in augs},
    }
    changed = sum(1 for c in champions if c["mayhem"])
    print(f"{changed} champions with Mayhem ability changes, {sum(len(c['mayhem']) for c in champions)} changes;"
          f" {sum(1 for c in champions if c['aramBuild'])} ARAM builds; {len(tier)} tier rows; {len(sim)} sim builds")
    with open(os.path.join(HERE, "data.js"), "w") as f:
        f.write("// Built by champions/build_data.py from the League client files. Do not edit by hand.\n")
        f.write("window.CHAMPS_DATA = " + json.dumps(out, ensure_ascii=False, separators=(",", ":")) + ";\n")


if __name__ == "__main__":
    main()
