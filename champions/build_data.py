"""Build data.js for the champion pages (Champions, one page per champion).

Usage: python3 champions/build_data.py [--channel latest|pbe]
Writes champions/data.js. Python 3 standard library only. Champion files are cached in
~/.cache/deeparam-champions/<patch>/.

What it reads:
  v1/champion-summary.json, v1/champions/{id}.json   names, titles, roles, splash, ability text and icons, pick quote
  game/data/characters/{alias}/{alias}.bin.json      Mayhem ability changes (DataValuesModeOverride and the
                                                     cooldown override, ARAM then Kiwi)
  v1/items.json, v1/cherry-augments.json             item and augment names and icons (ids match Tencent's)
  data/cn/builds/{id}.json (in this repo)            Mayhem build stats per champion (101.qq.com, refreshed daily
                                                     by the My Stats thread): items, augments, skill orders, teammates
  data/cn/champions.csv (in this repo)               Tier List rank, win and pick rate

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


def load_build(cid):
    """One champion's Mayhem build stats from data/cn/builds/{id}.json (the My Stats thread refreshes them daily)."""
    path = os.path.join(REPO, "data", "cn", "builds", f"{cid}.json")
    if not os.path.exists(path):
        return None
    with open(path) as f:
        b = json.load(f)
    rows = lambda xs, n: [{"items": x["items"], "pick": x["pick_rate"], "win": x["win_rate"]} for x in xs or []][:n]  # noqa: E731
    items = b.get("items") or {}
    aug = b.get("augments") or {}
    return {
        "date": b.get("date"),
        "start": sorted(rows(items.get("starting"), 99), key=lambda r: -r["pick"])[:5],
        "boots": rows(items.get("boots"), 4),
        "first": rows(items.get("other"), 8),
        "core": rows(items.get("core"), 6),
        "full": rows(items.get("full_builds"), 6),
        "augments": {t: [{"id": a["id"], "pick": a["pick_rate"], "grade": a.get("grade") or ""} for a in aug.get(t) or []][:10]
                     for t in ("prismatic", "gold", "silver")},
        "skills": [{"max": "".join(s["max_order"]), "pick": s["pick_rate"], "win": s["win_rate"],
                    "orders": [{"levels": "".join(o["order"]), "pick": o["pick_rate"], "win": o["win_rate"]} for o in s.get("orders") or []][:3]}
                   for s in b.get("skills") or []][:3],
        "mates": [{"id": m["id"], "win": m["win_rate"], "pick": m["pick_rate"]} for m in b.get("partners") or []][:5],
    }

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

    builds = {c["id"]: load_build(c["id"]) for c in summary}

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
        b = builds.get(c["id"])
        if b:
            used_items.update(i for k in ("start", "boots", "first", "core", "full") for r in b[k] for i in r["items"])
            used_augs.update(a["id"] for rows in b["augments"].values() for a in rows)
        champions.append({
            "id": c["id"], "alias": c["alias"], "name": info["name"], "title": info.get("title", ""),
            "roles": info.get("roles") or [],
            "icon": asset(info.get("squarePortraitPath")),
            "splash": asset(base_skin.get("uncenteredSplashPath") or base_skin.get("splashPath")),
            "tile": asset(base_skin.get("tilePath")),
            "vo": asset(info.get("chooseVoPath")),
            "abilities": abilities,
            "mayhem": mayhem_changes(bin_, record) if record else [],
            "tier": tier.get(c["id"]),
            "builds": b,
        })
    champions.sort(key=lambda c: c["name"])

    out = {
        "patch": version,
        "champions": champions,
        "items": {i: {"name": items[i]["name"], "icon": asset(items[i]["iconPath"])} for i in sorted(used_items) if i in items},
        "augments": {a: {"name": augs[a]["nameTRA"], "icon": asset(augs[a].get("augmentSmallIconPath")),
                         "tier": {"kSilver": "Silver", "kGold": "Gold", "kPrismatic": "Prismatic"}.get(augs[a].get("rarity"), "")}
                     for a in sorted(used_augs) if a in augs},
    }
    changed = sum(1 for c in champions if c["mayhem"])
    print(f"{changed} champions with Mayhem ability changes, {sum(len(c['mayhem']) for c in champions)} changes;"
          f" {sum(1 for c in champions if c['builds'])} champions with build stats; {len(tier)} tier rows")
    with open(os.path.join(HERE, "data.js"), "w") as f:
        # no header comment: the file ships to the site, and pages don't say where data comes from
        f.write("window.CHAMPS_DATA = " + json.dumps(out, ensure_ascii=False, separators=(",", ":")) + ";\n")


if __name__ == "__main__":
    main()
