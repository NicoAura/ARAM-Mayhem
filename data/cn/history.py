#!/usr/bin/env python3
"""Build the full China-server Mayhem champion history, patch by patch.

Tencent serves champion stats for every day since 2025-11-02. Each day's numbers
are cumulative since the current patch's data window opened, and they reset when
a new patch's window opens. So the last day of each window holds that patch's
whole sample.

Writes under data/cn/history/:
  daily/YYYY-MM.csv  every day's champion stats (source of truth; new days appended)
  patches.csv        each patch's data window
  by_patch.csv       each champion's full-patch numbers (last day of each window)
  all_time.csv       each champion across all patches, weighted by estimated games

Usage: python3 data/cn/history.py [--rebuild]   (--rebuild re-downloads every day)
Standard library only.
"""

import argparse
import csv
import datetime as dt
import glob
import json
import os
import statistics
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor

from fetch_cn import HERO_LIST, OUT, get, odp

FIRST_DAY = dt.date(2025, 11, 2)  # earliest date the API returns
HIST = os.path.join(OUT, "history")
DAILY = os.path.join(HIST, "daily")
VERSIONS = "https://mlol.qt.qq.com/go/database/versionlist"
DAILY_COLS = ["date", "champion_id", "rank", "win_rate", "pick_rate", "avg_damage_ratio",
              "avg_tank_ratio", "avg_participation_rate", "avg_death_time", "augment_ids"]
STATS = ["win_rate", "pick_rate", "avg_damage_ratio", "avg_tank_ratio",
         "avg_participation_rate", "avg_death_time"]
# A day whose mean win-rate change is this many times the typical daily change
# marks a new patch window.
RESET_FACTOR = 5
RESET_SEARCH_DAYS = 6


def read_daily():
    rows = []
    for path in sorted(glob.glob(os.path.join(DAILY, "*.csv"))):
        with open(path, encoding="utf-8") as f:
            rows.extend(csv.DictReader(f))
    return rows


def fetch_day(day):
    _, payload = odp("fuwen_aram_hero_rank_v2", {"dtstatdate": day.strftime("%Y%m%d")})
    if not payload:
        return day, []
    rows = []
    for rec in filter(None, payload.get("listcollect", "").split("#")):
        s = rec.split("_")
        rows.append({"date": day.isoformat(), "champion_id": s[0], "rank": s[1],
                     "win_rate": s[3], "pick_rate": s[4], "avg_death_time": s[6],
                     "avg_participation_rate": s[7], "avg_damage_ratio": s[8],
                     "avg_tank_ratio": s[9], "augment_ids": s[10] if len(s) > 10 else ""})
    return day, rows


def update_daily(rebuild):
    rows = [] if rebuild else read_daily()
    have = {r["date"] for r in rows}
    last = dt.date.today() - dt.timedelta(days=1)
    missing = [FIRST_DAY + dt.timedelta(n) for n in range((last - FIRST_DAY).days + 1)]
    missing = [d for d in missing if d.isoformat() not in have]
    with ThreadPoolExecutor(6) as ex:
        fetched = list(ex.map(fetch_day, missing))
    added = [d for d, r in fetched if r]
    for _, r in fetched:
        rows.extend(r)
    by_month = defaultdict(list)
    for r in rows:
        by_month[r["date"][:7]].append(r)
    os.makedirs(DAILY, exist_ok=True)
    for month, mrows in by_month.items():
        mrows.sort(key=lambda r: (r["date"], int(r["rank"])))
        with open(os.path.join(DAILY, f"{month}.csv"), "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=DAILY_COLS)
            w.writeheader()
            w.writerows(mrows)
    print(f"daily: {len(added)} new day(s), {len({r['date'] for r in rows})} days total")
    return rows


def windows(days_by, patches):
    """Split days into patch windows: [(patch, released, opened, first day, last day)]."""
    days = sorted(days_by)
    change = {}
    for a, b in zip(days, days[1:]):
        shared = days_by[a].keys() & days_by[b].keys()
        change[b] = sum(abs(days_by[a][c]["win_rate"] - days_by[b][c]["win_rate"])
                        for c in shared) / len(shared)
    typical = statistics.median(change.values())
    starts = []  # (start day, patch name, release date)
    for name, released in patches:
        if released > days[-1]:
            continue
        start = released
        for n in range(RESET_SEARCH_DAYS + 1):
            d = released + dt.timedelta(n)
            if change.get(d, 0) > RESET_FACTOR * typical:
                start = d
                break
        starts.append((start, name, released))
    starts.sort()
    out = []
    for i, (start, name, released) in enumerate(starts):
        nxt = starts[i + 1][0] if i + 1 < len(starts) else days[-1] + dt.timedelta(1)
        span = [d for d in days if start <= d < nxt] if i else [d for d in days if d < nxt]
        if span:
            out.append((name, released, max(start, released), span[0], span[-1]))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--rebuild", action="store_true", help="re-download every day")
    args = ap.parse_args()

    rows = update_daily(args.rebuild)
    heroes = {h["heroId"]: h for h in get(HERO_LIST)["hero"]}
    versions = get(VERSIONS, {"zone": "lol", "from": "h5"})["data"]
    patches = sorted(((v["name"], dt.datetime.strptime(v["vkey"], "%Y%m%d").date())
                      for v in versions), key=lambda p: p[1])

    days_by = {}
    for r in rows:
        d = dt.date.fromisoformat(r["date"])
        for k in STATS:
            r[k] = float(r[k])
        days_by.setdefault(d, {})[r["champion_id"]] = r
    wins = windows(days_by, patches)

    patch_rows, by_patch = [], []
    for name, released, opened, first, last in wins:
        # The window covers games from when it opened (or the patch release, for
        # the first window, which began before the API's history) to its last day.
        n_days = (last - opened).days + 1
        patch_rows.append({"patch": name, "released": released, "window_start": opened,
                           "first_day_in_data": first, "last_day": last, "days": n_days})
        for cid, r in days_by[last].items():
            h = heroes.get(cid, {})
            by_patch.append({"patch": name, "days": n_days, "champion_id": cid,
                             "name": h.get("alias", cid), "name_cn": h.get("title", ""),
                             "rank": r["rank"], **{k: r[k] for k in STATS},
                             "augment_ids": r["augment_ids"]})

    # Pick rates are shares of games, so a champion's games in a patch are
    # estimated as pick_rate x window days (assumes similar games per day).
    agg = defaultdict(lambda: defaultdict(float))
    for r in by_patch:
        a = agg[r["champion_id"]]
        w = r["pick_rate"] * r["days"]
        a["weight"] += w
        a["days"] += r["days"]
        a["patches"] += 1
        for k in STATS:
            a[k] += r[k] * (r["days"] if k == "pick_rate" else w)
    total_days = sum(p["days"] for p in patch_rows)
    all_time = []
    for cid, a in agg.items():
        h = heroes.get(cid, {})
        row = {"champion_id": cid, "name": h.get("alias", cid), "name_cn": h.get("title", ""),
               "patches": int(a["patches"]),
               "est_game_share": round(a["weight"] / total_days / 10, 6)}
        for k in STATS:
            row[k] = round(a[k] / (a["days"] if k == "pick_rate" else a["weight"]), 6)
        all_time.append(row)
    all_time.sort(key=lambda r: -r["win_rate"])
    for i, r in enumerate(all_time, 1):
        r["win_rate_rank"] = i

    def write(name, data, cols):
        with open(os.path.join(HIST, name), "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=cols)
            w.writeheader()
            w.writerows(data)

    write("patches.csv", patch_rows, list(patch_rows[0]))
    write("by_patch.csv", by_patch, list(by_patch[0]))
    write("all_time.csv", all_time, ["win_rate_rank", "champion_id", "name", "name_cn",
                                     "win_rate", "pick_rate", "est_game_share", "patches",
                                     *STATS[2:]])
    print(f"patches: {len(patch_rows)} ({patch_rows[0]['patch']} to {patch_rows[-1]['patch']}), "
          f"champions: {len(all_time)}")


if __name__ == "__main__":
    main()
