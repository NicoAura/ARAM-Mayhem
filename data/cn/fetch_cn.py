#!/usr/bin/env python3
"""Fetch ARAM Mayhem stats from the official 101.qq.com (Tencent) backend.

These are the same endpoints the official LOL strategy site (https://101.qq.com/)
calls for its "海克斯大乱斗" (Hextech/Mayhem) rankings. No login is needed.

Writes, next to this script:
  champions.json / champions.csv   champion win and pick rates
  augments.json  / augments.csv    augment win and pick rates
  duos.json                        best champion pairs
  raw/                             untouched API responses for the date

Usage: python3 data/cn/fetch_cn.py [--date YYYYMMDD]
Standard library only.
"""

import argparse
import csv
import datetime as dt
import json
import os
import urllib.parse
import urllib.request

API = "https://mlol.qt.qq.com/go/battle_info/odp_proxy/"
HERO_LIST = "https://game.gtimg.cn/images/lol/act/img/js/heroList/hero_list.js"
AUGMENTS = "https://game.gtimg.cn/images/lol/act/img/js/kiwi/kiwi_augments.json"
HEADERS = {"Referer": "https://101.qq.com/", "User-Agent": "Mozilla/5.0"}
OUT = os.path.dirname(os.path.abspath(__file__))
TIERS = {"kPrismatic": "Prismatic", "kGold": "Gold", "kSilver": "Silver"}
# Augment tiers and the live Mayhem pool come from the game client's own files
# (rarity: absent/0 Silver, 1 Gold, 2 Prismatic); Tencent's list can lag a patch.
CLIENT = "https://raw.communitydragon.org/latest"
KIWI_BIN = CLIENT + "/game/maps/modespecificdata/kiwi.bin.json"
AUGMENT_LISTS = CLIENT + "/plugins/rcp-be-lol-game-data/global/default/v1/augment-lists.json"
CHERRY_AUGMENTS = CLIENT + "/plugins/rcp-be-lol-game-data/global/default/v1/cherry-augments.json"
RARITY = {0: "Silver", 1: "Gold", 2: "Prismatic"}


def get(url, params=None):
    if params:
        url += "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode("utf-8"))


def odp(endpoint, params):
    """Call an odp_proxy endpoint; return (raw response, decoded inner payload or None)."""
    raw = get(API + endpoint, params)
    fields = (raw.get("data") or {}).get("_fieldValues") or {}
    if not fields:
        return raw, None
    inner = next(iter(fields.values()))
    try:
        return raw, json.loads(inner)
    except (TypeError, ValueError):
        return raw, inner


def parse_champions(payload):
    rows = []
    for rec in filter(None, payload.get("listcollect", "").split("#")):
        s = rec.split("_")
        partners = []
        for p in filter(None, s[5].split("&")):
            cid, pick, win, rank = p.split(",")
            partners.append({"champion_id": int(cid), "pick_rate": float(pick),
                             "win_rate": float(win), "rank": int(rank)})
        rows.append({
            "champion_id": int(s[0]),
            "rank": int(s[1]),
            "rank_change": s[2],
            "win_rate": float(s[3]),
            "pick_rate": float(s[4]),
            "avg_death_time": float(s[6]),
            "avg_participation_rate": float(s[7]),
            "avg_damage_ratio": float(s[8]),
            "avg_tank_ratio": float(s[9]),
            "lowest_rank_augments": [int(x) for x in s[10].split(",") if x] if len(s) > 10 else [],
            "best_partners": partners,
        })
    return rows


def client_augments():
    """{augment id: {tier, key, name, live}} from the live client, or {} if unreachable."""
    try:
        kiwi = get(KIWI_BIN)
        pool = set(next(x["augmentList"] for x in get(AUGMENT_LISTS) if x.get("modeName") == "KIWI"))
        names = {a["id"]: a.get("nameTRA", "") for a in get(CHERRY_AUGMENTS)}
    except Exception as e:  # stats still publish with Tencent's tiers
        print(f"client augment data unavailable ({e}); using Tencent tiers")
        return {}
    out = {}
    for path, a in kiwi.items():
        if isinstance(a, dict) and a.get("__type") == "AugmentData" and a.get("AugmentPlatformId"):
            i = a["AugmentPlatformId"]
            out[i] = {"tier": RARITY.get(a.get("rarity", 0), ""), "key": a.get("AugmentNameId", ""),
                      "name": names.get(i, ""), "live": path in pool}
    return out


def parse_augments(payload):
    rows = []
    for rec in filter(None, payload.get("augmentlist", "").split("#")):
        s = rec.split("_")
        rows.append({
            "augment_id": int(s[0]),
            "pick_rate": float(s[2]),
            "pick_rank": int(s[3]),
            "pick_rank_change": int(s[4]),
            "win_rate": float(s[5]),
            "win_rank": int(s[6]),
            "win_rank_change": int(s[7]),
            "best_champions": [int(x) for x in s[8].split(",") if x] if len(s) > 8 else [],
        })
    return rows


def parse_duos(payload):
    rows = []
    for rec in filter(None, payload.get("championid_data", "").split("#")):
        ids, roles, win, pick, rank = rec.split("|")
        a, b = ids.split(";")
        rows.append({"champion_ids": [int(a), int(b)], "roles": roles.split(";"),
                     "win_rate": float(win), "pick_rate": float(pick), "rank": int(rank)})
    return rows


def write_csv(path, rows, cols):
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=cols, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", help="stat date YYYYMMDD (default: newest available)")
    args = ap.parse_args()

    heroes = {int(h["heroId"]): h for h in get(HERO_LIST)["hero"]}
    augs = {a["augmentID"]: a for a in get(AUGMENTS)}

    # Champion stats are published per day; yesterday is usually the newest.
    dates = [args.date] if args.date else [
        (dt.date.today() - dt.timedelta(days=n)).strftime("%Y%m%d") for n in (1, 2, 3)]
    for date in dates:
        champ_raw, champ_payload = odp("fuwen_aram_hero_rank_v2", {"dtstatdate": date})
        if champ_payload:
            break
    else:
        raise SystemExit(f"no champion data for {dates}")

    aug_raw, aug_payload = odp("fuwen_aram_rune_rank_v2", {"augmentid_level": 255})
    duo_raw, duo_payload = odp("fuwen_aram_hero_parttner",
                               {"role1": 255, "role2": 255, "championid": 255})

    def champ_name(cid):
        h = heroes.get(cid, {})
        return h.get("alias", str(cid)), h.get("title", "")

    champions = parse_champions(champ_payload)
    for c in champions:
        c["name"], c["name_cn"] = champ_name(c["champion_id"])
    augments = parse_augments(aug_payload)
    client = client_augments()
    for a in augments:
        meta = augs.get(a["augment_id"], {})
        mine = client.get(a["augment_id"], {})
        a["name_cn"] = meta.get("name_cn", "")
        a["key"] = mine.get("key") or meta.get("name_en", "")
        a["tier"] = mine.get("tier") or TIERS.get(meta.get("level"), meta.get("level", ""))
    # Live augments nobody has played enough yet: listed so pages can say "no data yet"
    have = {a["augment_id"] for a in augments}
    no_data = sorted(({"augment_id": i, "key": c["key"], "name": c["name"], "tier": c["tier"]}
                      for i, c in client.items() if c["live"] and i not in have),
                     key=lambda r: r["augment_id"])
    duos = parse_duos(duo_payload)
    for d in duos:
        d["names"] = [champ_name(c)[0] for c in d["champion_ids"]]

    meta = {"source": "101.qq.com (Tencent, official)", "server": "Tencent",
            "champion_stat_date": date,
            "augment_stat_date": aug_payload.get("dtstatdate", ""),
            "fetched_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")}

    os.makedirs(os.path.join(OUT, "raw"), exist_ok=True)
    for name, raw in (("champions", champ_raw), ("augments", aug_raw), ("duos", duo_raw)):
        with open(os.path.join(OUT, "raw", f"{name}.json"), "w", encoding="utf-8") as f:
            json.dump(raw, f, ensure_ascii=False)
    for name, rows in (("champions", champions), ("augments", augments), ("duos", duos)):
        body = {"meta": meta, name: rows}
        if name == "augments":
            body["no_data"] = no_data
        with open(os.path.join(OUT, f"{name}.json"), "w", encoding="utf-8") as f:
            json.dump(body, f, ensure_ascii=False, indent=1)

    write_csv(os.path.join(OUT, "champions.csv"), champions,
              ["rank", "champion_id", "name", "name_cn", "win_rate", "pick_rate", "rank_change",
               "avg_damage_ratio", "avg_tank_ratio", "avg_participation_rate", "avg_death_time"])
    write_csv(os.path.join(OUT, "augments.csv"), sorted(augments, key=lambda a: a["win_rank"]),
              ["win_rank", "augment_id", "key", "name_cn", "tier", "win_rate", "pick_rate", "pick_rank"])

    # Augments and duos have no history in the API, so keep one file per day here.
    stamp = aug_payload.get("dtstatdate") or dt.date.today().strftime("%Y%m%d")
    stamp = f"{stamp[:4]}-{stamp[4:6]}-{stamp[6:]}"
    for name, rows, cols in (
            ("augments", [{**a, "best_champions": " ".join(map(str, a["best_champions"]))}
                          for a in augments], ["augment_id", "key", "name_cn", "tier", "win_rate",
                                    "win_rank", "pick_rate", "pick_rank", "best_champions"]),
            ("duos", [{**d, "champion_ids": " ".join(map(str, d["champion_ids"])),
                       "names": " ".join(d["names"])} for d in duos],
             ["rank", "champion_ids", "names", "win_rate", "pick_rate"])):
        os.makedirs(os.path.join(OUT, "history", name), exist_ok=True)
        write_csv(os.path.join(OUT, "history", name, f"{stamp}.csv"), rows, cols)

    print(f"champions: {len(champions)} (date {date})  augments: {len(augments)} "
          f"(+{len(no_data)} with no data yet)  duos: {len(duos)}")


if __name__ == "__main__":
    main()
