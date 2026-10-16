#!/usr/bin/env python3
"""Build data/items.json for the all-champion simulator.

Stats come from Riot's Data Dragon item file (the numbers in each item's
description); passives come from the hand-written data/item_effects.json.

    python3 simulator/tools/build_items.py

Python 3 standard library only.
"""

import json
import os
import re
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "data")
DDRAGON = "https://ddragon.leagueoflegends.com"

STAT_NAMES = {
    "attack damage": "ad", "ability power": "ap", "attack speed": "as",
    "critical strike chance": "crit", "critical strike damage": "crit_damage",
    "health": "hp", "armor": "armor", "magic resist": "mr", "ability haste": "ah",
    "lethality": "lethality", "armor penetration": "armor_pen", "magic penetration": "magic_pen",
    "life steal": "lifesteal", "omnivamp": "omnivamp",
}
PERCENT = {"as", "crit", "crit_damage", "armor_pen", "lifesteal", "omnivamp"}


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "aram-mayhem-sim"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode("utf-8"))


def parse_stats(desc):
    stats = {}
    block = re.search(r"<stats>(.*?)</stats>", desc, re.S)
    for value, name in re.findall(r"<attention>\s*([0-9.]+%?)\s*</attention>\s*([A-Za-z' ]+)", block.group(1) if block else ""):
        key = STAT_NAMES.get(name.strip().lower())
        if not key:
            continue
        pct = value.endswith("%")
        v = float(value.rstrip("%"))
        if key == "magic_pen" and pct:
            key = "magic_pen_pct"
        stats[key] = v / 100.0 if (pct or key in PERCENT) and key != "magic_pen" else v
    return stats


def main():
    version = get(DDRAGON + "/api/versions.json")[0]
    items = get(f"{DDRAGON}/cdn/{version}/data/en_US/item.json")["data"]
    with open(os.path.join(DATA, "item_effects.json"), encoding="utf-8") as f:
        hand = json.load(f)
    out = {}
    for group in ("boots", "items"):
        for item_id, h in hand[group].items():
            it = items.get(item_id)
            if it is None:
                sys.exit(f"item {item_id} ({h['key']}) is not in Data Dragon {version}")
            stats = parse_stats(it.get("description", ""))
            stats.update(h.get("stats", {}))
            for k, v in h.get("stats_add", {}).items():
                stats[k] = stats.get(k, 0) + v
            out[h["key"]] = {
                "id": int(item_id),
                "name": it["name"],
                "slot": "boots" if group == "boots" else "legendary",
                "cost": it["gold"]["total"],
                "roles": h.get("roles", []),
                "stats": stats,
                "effects": h.get("effects", {}),
                "confidence": h.get("confidence", "approx" if h.get("effects") else "verified"),
                **({"note": h["note"]} if h.get("note") else {}),
            }
    doc = {"meta": {"ddragon_version": version,
                    "notes": ["stats: Data Dragon item descriptions (verified). effects: data/item_effects.json "
                              "(passives; approx unless confidence says otherwise)."]},
           "items": out}
    path = os.path.join(DATA, "items.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, indent=1)
        f.write("\n")
    print(f"wrote {len(out)} items to {os.path.relpath(path)} (Data Dragon {version})")


if __name__ == "__main__":
    main()
