#!/usr/bin/env python3
"""Fetch each champion's Mayhem build data: augments, skill order, items, partners.

Same backend as fetch_cn.py: the endpoint 101.qq.com's champion page calls in
Mayhem (海斗) mode, `fuwen_hero_rank?championid=N`. It returns the newest day's
numbers only, so the daily run overwrites one file per champion.

Writes data/cn/builds/<champion_id>.json (see README.md for the format) and
builds/index.json listing every champion with a file.

Usage: python3 data/cn/builds.py [champion_id ...]   (default: every champion)
Standard library only.
"""

import datetime as dt
import json
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor

from fetch_cn import HERO_LIST, OUT, get, odp

BUILDS = os.path.join(OUT, "builds")
SKILLS = {"1": "Q", "2": "W", "3": "E", "4": "R"}
TIERS = {"255": "all", "kSilver": "silver", "kGold": "gold", "kPrismatic": "prismatic"}


def ratio(v, basis_points=False):
    try:
        v = float(v)
    except (TypeError, ValueError):
        return None
    return round(v / 10000 if basis_points else v, 4)


def item_ids(s):
    return [int(i) for i in str(s).replace("&", ",").split(",") if i.strip().isdigit() and int(i) > 0]


def parse_dollar_list(s):
    """'ids$pick$win#...' (starting items, boots)."""
    rows = []
    for rec in filter(None, str(s or "").split("#")):
        ids, pick, win = (rec.split("$") + ["", ""])[:3]
        if item_ids(ids):
            rows.append({"items": item_ids(ids), "pick_rate": ratio(pick), "win_rate": ratio(win)})
    return rows


def parse_json_list(s, key):
    """{"1": {key: "a&b", "showrate": 1543, "winrate": 5287}, ...} with rates in basis points."""
    try:
        d = json.loads(s) if isinstance(s, str) else (s or {})
    except ValueError:
        return []
    rows = []
    for v in (d.values() if isinstance(d, dict) else d):
        if item_ids(v.get(key, "")):
            rows.append({"items": item_ids(v[key]), "pick_rate": ratio(v.get("showrate"), True),
                         "win_rate": ratio(v.get("winrate"), True)})
    return sorted(rows, key=lambda r: -(r["pick_rate"] or 0))


def parse_full_builds(s):
    """'rank_ids_pick_win;...' (most common six-item builds)."""
    rows = []
    for rec in filter(None, str(s or "").split(";")):
        p = rec.split("_")
        if len(p) >= 4 and item_ids(p[1]):
            rows.append({"items": item_ids(p[1]), "pick_rate": ratio(p[2]), "win_rate": ratio(p[3])})
    return rows


def parse_augments(s):
    """'255:rank|champ|aug|tier|pick|grade#...&kGold:...' -> {all, silver, gold, prismatic}."""
    out = {t: [] for t in TIERS.values()}
    for section in filter(None, str(s or "").split("&")):
        tier, _, body = section.partition(":")
        key = TIERS.get(tier.strip())
        if not key:
            continue
        for rec in filter(None, body.split("#")):
            p = rec.split("|")
            if len(p) >= 5 and p[2].isdigit():
                out[key].append({"id": int(p[2]), "pick_rate": ratio(p[4]),
                                 "grade": p[5] if len(p) > 5 else ""})
    return out


def parse_skills(s):
    """Skill max orders, each with its most common level-by-level sequences."""
    try:
        d = json.loads(s) if isinstance(s, str) else (s or {})
    except ValueError:
        return []
    out = []
    for v in d.values():
        orders = [{"order": [SKILLS.get(k, k) for k in str(o.get("sk", "")).split("&") if k],
                   "pick_rate": ratio(o.get("sk_s"), True), "win_rate": ratio(o.get("sk_w"), True)}
                  for o in (v.get("sks") or {}).values()]
        out.append({"max_order": [SKILLS.get(k, k) for k in str(v.get("qwe", "")).split("&") if k],
                    "pick_rate": ratio(v.get("qwe_s"), True), "win_rate": ratio(v.get("qwe_w"), True),
                    "orders": orders})
    return sorted(out, key=lambda r: -(r["pick_rate"] or 0))


def parse_partners(s):
    rows = []
    for rec in filter(None, str(s or "").split("#")):
        p = rec.split("|")
        if len(p) >= 3 and p[0].isdigit():
            rows.append({"id": int(p[0]), "win_rate": ratio(p[1]), "pick_rate": ratio(p[2])})
    return rows


def build(cid, name):
    _, p = odp("fuwen_hero_rank", {"championid": cid})
    if not isinstance(p, dict) or not p.get("dtstatdate"):
        return None
    d = p["dtstatdate"]
    return {
        "id": cid, "name": name, "date": f"{d[:4]}-{d[4:6]}-{d[6:]}",
        "augments": parse_augments(p.get("augment_json_irank") or p.get("augment_json")),
        "skills": parse_skills(p.get("skill_json")),
        "items": {
            "starting": parse_dollar_list(p.get("itemout")),
            "boots": parse_dollar_list(p.get("itemshoes")),
            "core": parse_json_list(p.get("itemcore_json"), "itemcore"),
            "other": parse_json_list(p.get("itemone_json"), "itemone"),
            "full_builds": parse_full_builds(p.get("itemover_rec")),
        },
        "partners": parse_partners(p.get("championid_json")),
    }


def main():
    heroes = {int(h["heroId"]): h.get("alias", h["heroId"]) for h in get(HERO_LIST)["hero"]}
    ids = [int(a) for a in sys.argv[1:]] or sorted(heroes)
    os.makedirs(BUILDS, exist_ok=True)

    def one(cid):
        for attempt in range(3):
            try:
                return cid, build(cid, heroes.get(cid, str(cid)))
            except Exception as e:  # one champion failing shouldn't stop the rest
                err = e
                time.sleep(2 * (attempt + 1))
        print(f"champion {cid}: {err}", file=sys.stderr)
        return cid, None

    with ThreadPoolExecutor(6) as ex:
        results = list(ex.map(one, ids))
    written = []
    for cid, data in results:
        if data:
            with open(os.path.join(BUILDS, f"{cid}.json"), "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
            written.append({"id": cid, "name": data["name"], "date": data["date"]})
    if len(sys.argv) == 1:
        with open(os.path.join(BUILDS, "index.json"), "w", encoding="utf-8") as f:
            json.dump({"updated": dt.date.today().isoformat(), "champions": written}, f,
                      ensure_ascii=False, indent=1)
    print(f"builds: {len(written)} of {len(ids)} champions")


if __name__ == "__main__":
    main()
