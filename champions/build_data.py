"""Build data.js for the champion pages (Champions, one page per champion).

Usage: python3 champions/build_data.py [--channel latest|pbe]
Writes champions/data.js. Python 3 standard library only. Champion files are cached in
~/.cache/deeparam-champions/<patch>/, build stats per day.

What it reads:
  v1/champion-summary.json, v1/champions/{id}.json   names, titles, roles, splash, ability text and icons, pick quote
  game/data/characters/{alias}/{alias}.bin.json      Mayhem ability changes (DataValuesModeOverride and the
                                                     cooldown override, ARAM then Kiwi)
  v1/items.json, v1/cherry-augments.json             item and augment names and icons (ids match Tencent's)
  mlol.qt.qq.com .../fuwen_hero_rank?championid=N    Mayhem build stats per champion (the 101.qq.com Mayhem
                                                     build view): starting items, boots, first item, core
                                                     trios, full builds, augments by tier, skill orders, teammates
  data/cn/champions.csv (in this repo)               Tier List rank, win and pick rate

Not in the client: the per-champion damage dealt/taken, tenacity, healing and ability haste
adjustments. Riot applies those on the game server, so this page doesn't show them.
"""
import argparse, csv, datetime as dt, json, os, re, time, urllib.error, urllib.request
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


BUILDS_API = "https://mlol.qt.qq.com/go/battle_info/odp_proxy/fuwen_hero_rank"
BUILDS_HEADERS = {"Referer": "https://101.qq.com/", "User-Agent": "Mozilla/5.0"}


def fetch_build(cid, cache_dir, tries=5):
    """One champion's Mayhem build stats for the newest day: the payload behind the strategy site's Mayhem build view."""
    path = os.path.join(cache_dir, f"{cid}.json")
    if os.path.exists(path):
        with open(path) as f:
            return json.load(f)
    req = urllib.request.Request(f"{BUILDS_API}?championid={cid}", headers=BUILDS_HEADERS)
    for attempt in range(tries):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                raw = json.loads(r.read().decode("utf-8"))
            break
        except (urllib.error.URLError, ConnectionError, TimeoutError, ValueError):
            if attempt == tries - 1:
                return None
            time.sleep(1.5 * (attempt + 1))
    fields = (raw.get("data") or {}).get("_fieldValues") or {}
    if not fields:
        return None
    payload = json.loads(next(iter(fields.values())))
    os.makedirs(cache_dir, exist_ok=True)
    with open(path, "w") as f:
        json.dump(payload, f)
    return payload


def parse_build(p):
    """Turn the payload's packed strings into lists. Rates are fractions (0.52 = 52%)."""
    if not p:
        return None
    ids = lambda s, sep: [int(x) for x in str(s).split(sep) if x.strip().isdigit()]  # noqa: E731

    def dollar(s):  # "3020$0.4995$0.5146#3158$..." -> items, pick, win
        out = []
        for rec in filter(None, (s or "").split("#")):
            parts = rec.split("$")
            if len(parts) >= 3:
                out.append({"items": ids(parts[0], ","), "pick": float(parts[1]), "win": float(parts[2])})
        return out

    def ranked(js, key):  # {"1": {key: "a&b", "winrate": 5287, "showrate": 1543}} (hundredths of a percent)
        try:
            d = json.loads(js) if isinstance(js, str) else (js or {})
        except ValueError:
            return []
        rows = [d[k] for k in sorted(d, key=lambda k: int(k))]
        return [{"items": ids(r[key], "&"), "pick": int(r["showrate"]) / 10000, "win": int(r["winrate"]) / 10000} for r in rows]

    builds = []
    for rec in filter(None, (p.get("itemover_rec") or "").split(";")):
        parts = rec.split("_")
        if len(parts) >= 4:
            builds.append({"items": ids(parts[1], ","), "pick": float(parts[2]), "win": float(parts[3])})

    grade = {}
    for rec in filter(None, (p.get("augment_json_irank") or "").split(":", 1)[-1].split("#")):
        f = rec.split("|")
        if len(f) >= 6 and f[2].isdigit():
            grade[int(f[2])] = f[5]
    augments = {}
    for block in filter(None, (p.get("augment_json") or "").split("&")):
        tier, _, rows = block.partition(":")
        name = {"kPrismatic": "prismatic", "kGold": "gold", "kSilver": "silver"}.get(tier)
        if not name:
            continue
        for rec in filter(None, rows.split("#")):
            f = rec.split("|")
            if len(f) >= 5 and f[2].isdigit():
                augments.setdefault(name, []).append({"id": int(f[2]), "pick": float(f[4]), "grade": grade.get(int(f[2]), "")})

    skills = []
    try:
        sk = json.loads(p.get("skill_json") or "{}")
    except ValueError:
        sk = {}
    keys = "QWER"
    for k in sorted(sk, key=int):
        g = sk[k]
        orders = [{"levels": "".join(keys[int(x) - 1] for x in o["sk"].split("&") if x.isdigit() and 0 < int(x) <= 4),
                   "pick": int(o["sk_s"]) / 10000, "win": int(o["sk_w"]) / 10000} for _, o in sorted((g.get("sks") or {}).items(), key=lambda kv: int(kv[0]))]
        skills.append({"max": "".join(keys[int(x) - 1] for x in g["qwe"].split("&") if x.isdigit()),
                       "pick": int(g["qwe_s"]) / 10000, "win": int(g["qwe_w"]) / 10000, "orders": orders[:3]})

    mates = []
    for rec in filter(None, (p.get("championid_json") or "").split("#")):
        f = rec.split("|")
        if len(f) >= 3 and f[0].isdigit():
            mates.append({"id": int(f[0]), "win": float(f[1]), "pick": float(f[2])})

    return {
        "date": p.get("dtstatdate"),
        "start": sorted(dollar(p.get("itemout")), key=lambda r: -r["pick"])[:5],
        "boots": dollar(p.get("itemshoes"))[:4],
        "first": ranked(p.get("itemone_json"), "itemone")[:8],
        "core": ranked(p.get("itemcore_json"), "itemcore")[:6],
        "full": builds[:6],
        "augments": {t: v[:10] for t, v in augments.items()},
        "skills": skills[:3],
        "mates": mates[:5],
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

    # Mayhem build stats, newest day; cached per day so a rerun the same day is quick
    day_cache = os.path.join(CACHE, "builds-" + dt.date.today().isoformat())
    with ThreadPoolExecutor(6) as pool:
        builds = dict(zip([c["id"] for c in summary], pool.map(lambda c: parse_build(fetch_build(c["id"], day_cache)), summary)))

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
