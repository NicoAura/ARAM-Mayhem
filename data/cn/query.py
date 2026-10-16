#!/usr/bin/env python3
"""Filter Mayhem champion stats by patch, month or date range.

Works offline from data/cn/history/ (built by history.py).

  python3 data/cn/query.py --patch 16.19              # one patch
  python3 data/cn/query.py --patch 16.18 --patch 16.19
  python3 data/cn/query.py --month 2026-09
  python3 data/cn/query.py --from 2026-09-01 --to 2026-09-14
  python3 data/cn/query.py                            # everything
  ... --out file.csv   (default: print CSV)

Tencent's daily numbers are running totals since the current patch's window
opened. A champion's games up to day t are estimated as pick_rate(t) x days since
the window opened (pick rate is a share of games; this assumes similar games per
day). Stats for a date range are the difference between the totals at its end and
the day before its start, summed over every patch window it touches. A whole patch
is exactly Tencent's own final numbers for that patch.
"""

import argparse
import calendar
import csv
import datetime as dt
import glob
import os
import sys
from collections import defaultdict

HIST = os.path.join(os.path.dirname(os.path.abspath(__file__)), "history")
STATS = ["win_rate", "avg_damage_ratio", "avg_tank_ratio",
         "avg_participation_rate", "avg_death_time"]
COLS = ["win_rate_rank", "champion_id", "name", "name_cn", "win_rate", "pick_rate",
        "est_game_share", *STATS[1:]]


def load():
    """Return (days_by: date -> champion_id -> row, windows, names)."""
    days_by = defaultdict(dict)
    for path in sorted(glob.glob(os.path.join(HIST, "daily", "*.csv"))):
        with open(path, encoding="utf-8") as f:
            for r in csv.DictReader(f):
                days_by[dt.date.fromisoformat(r["date"])][r["champion_id"]] = {
                    k: float(r[k]) for k in STATS + ["pick_rate"]}
    with open(os.path.join(HIST, "patches.csv"), encoding="utf-8") as f:
        windows = [{"patch": r["patch"],
                    "opened": dt.date.fromisoformat(r["window_start"]),
                    "first": dt.date.fromisoformat(r["first_day_in_data"]),
                    "last": dt.date.fromisoformat(r["last_day"])} for r in csv.DictReader(f)]
    names = {}
    with open(os.path.join(HIST, "by_patch.csv"), encoding="utf-8") as f:
        for r in csv.DictReader(f):
            names[r["champion_id"]] = (r["name"], r["name_cn"])
    return days_by, windows, names


def totals(days_by, w, day):
    """Running totals (games, sum of each stat x games) per champion at a day in window w."""
    while day >= w["first"] and day not in days_by:  # tolerate a missing day
        day -= dt.timedelta(1)
    if day < w["first"]:
        return {}
    n = (day - w["opened"]).days + 1
    out = {}
    for cid, r in days_by[day].items():
        games = r["pick_rate"] * n
        out[cid] = {"games": games, **{k: r[k] * games for k in STATS}}
    return out


def stats(days_by, windows, names, start, end):
    """Champion stats for games played from start to end (inclusive)."""
    acc = defaultdict(lambda: defaultdict(float))
    days = 0
    for w in windows:
        lo, hi = max(start, w["opened"]), min(end, w["last"])
        if hi < lo:
            continue
        # Before the API's first day the window's running total can't be split,
        # so a range starting there counts from the window's opening.
        if lo <= w["first"]:
            lo = w["opened"]
        days += (hi - lo).days + 1
        at_end = totals(days_by, w, hi)
        before = totals(days_by, w, lo - dt.timedelta(1)) if lo > w["first"] else {}
        for cid, e in at_end.items():
            b = before.get(cid, {})
            for k, v in e.items():
                acc[cid][k] += v - b.get(k, 0.0)
    rows = []
    for cid, a in acc.items():
        if a["games"] <= 0:
            continue
        name, name_cn = names.get(cid, (cid, ""))
        pick = a["games"] / days
        row = {"champion_id": cid, "name": name, "name_cn": name_cn,
               "pick_rate": round(pick, 6), "est_game_share": round(pick / 10, 6)}
        for k in STATS:
            row[k] = round(a[k] / a["games"], 6)
        rows.append(row)
    rows.sort(key=lambda r: -r["win_rate"])
    for i, r in enumerate(rows, 1):
        r["win_rate_rank"] = i
    return rows, days


def write(rows, out=None):
    f = open(out, "w", newline="", encoding="utf-8") if out else sys.stdout
    w = csv.DictWriter(f, fieldnames=COLS)
    w.writeheader()
    w.writerows(rows)
    if out:
        f.close()


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--patch", action="append", help="patch, e.g. 16.19 (repeatable)")
    ap.add_argument("--month", help="YYYY-MM")
    ap.add_argument("--from", dest="start", help="YYYY-MM-DD")
    ap.add_argument("--to", dest="end", help="YYYY-MM-DD")
    ap.add_argument("--out", help="write CSV here instead of printing")
    args = ap.parse_args()

    days_by, windows, names = load()
    if args.patch:
        known = {w["patch"] for w in windows}
        unknown = [p for p in args.patch if p not in known]
        if unknown:
            sys.exit(f"unknown patch {unknown}; available: {', '.join(w['patch'] for w in windows)}")
        windows = [w for w in windows if w["patch"] in args.patch]
    if args.month:
        y, m = map(int, args.month.split("-"))
        start, end = dt.date(y, m, 1), dt.date(y, m, calendar.monthrange(y, m)[1])
    else:
        start = dt.date.fromisoformat(args.start) if args.start else dt.date.min
        end = dt.date.fromisoformat(args.end) if args.end else dt.date.max
    rows, days = stats(days_by, windows, names, start, end)
    if not rows:
        sys.exit("no data in that selection")
    write(rows, args.out)
    print(f"{len(rows)} champions over {days} day(s)", file=sys.stderr)


if __name__ == "__main__":
    main()
