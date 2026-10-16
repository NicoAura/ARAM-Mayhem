#!/usr/bin/env python3
"""Build the China Mayhem stats preview page (one self-contained HTML file).

Usage: python3 data/cn/preview/build.py OUT.html
Reads data/cn/history/ and the current augment/duo snapshots, and inlines them
into template.html.
"""

import csv
import glob
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
CN = os.path.dirname(HERE)
HIST = os.path.join(CN, "history")
STATS = ["pick_rate", "win_rate", "avg_damage_ratio", "avg_tank_ratio",
         "avg_participation_rate", "avg_death_time"]


def rows(path):
    with open(path, encoding="utf-8") as f:
        return list(csv.DictReader(f))


def readable(key):
    key = re.sub(r"^ARAM_", "", key or "")
    return re.sub(r"(?<=[a-z0-9])(?=[A-Z])", " ", key).strip()


def main(out):
    names = {}
    for r in rows(os.path.join(HIST, "by_patch.csv")):
        names[r["champion_id"]] = [r["name"], r["name_cn"]]
    ids = sorted(names, key=lambda c: names[c][0])
    index = {c: i for i, c in enumerate(ids)}

    days = {}
    for path in sorted(glob.glob(os.path.join(HIST, "daily", "*.csv"))):
        for r in rows(path):
            day = days.setdefault(r["date"], [[None] * len(ids) for _ in STATS])
            i = index.get(r["champion_id"])
            if i is None:
                continue
            for s, k in enumerate(STATS):
                day[s][i] = float(r[k])
    dates = sorted(days)

    windows = [{"patch": r["patch"], "released": r["released"], "opened": r["window_start"],
                "first": r["first_day_in_data"], "last": r["last_day"]}
               for r in rows(os.path.join(HIST, "patches.csv"))]

    aug = json.load(open(os.path.join(CN, "augments.json"), encoding="utf-8"))
    augments = [{"id": a["augment_id"], "name": readable(a["key"]) or str(a["augment_id"]),
                 "cn": a["name_cn"], "tier": a["tier"], "win": a["win_rate"],
                 "pick": a["pick_rate"], "best": [str(c) for c in a["best_champions"][:5]]}
                for a in aug["augments"]]
    duo = json.load(open(os.path.join(CN, "duos.json"), encoding="utf-8"))
    duos = [{"a": str(d["champion_ids"][0]), "b": str(d["champion_ids"][1]),
             "win": d["win_rate"], "pick": d["pick_rate"], "rank": d["rank"]}
            for d in duo["duos"]]

    data = {"ids": ids, "names": [names[c] for c in ids], "stats": STATS,
            "dates": dates, "days": [days[d] for d in dates], "windows": windows,
            "augments": augments, "augmentDate": aug["meta"]["augment_stat_date"],
            "duos": duos}
    blob = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    html = open(os.path.join(HERE, "template.html"), encoding="utf-8").read()
    with open(out, "w", encoding="utf-8") as f:
        f.write(html.replace("/*__DATA__*/null", blob.replace("</", "<\\/")))
    print(f"wrote {out}: {len(dates)} days, {len(ids)} champions, {len(augments)} augments, "
          f"{len(duos)} duos, {os.path.getsize(out) / 1e6:.1f} MB")


if __name__ == "__main__":
    main(sys.argv[1])
