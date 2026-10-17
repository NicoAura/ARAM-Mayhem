#!/usr/bin/env python3
"""Re-run Simulator leaderboard submissions with the native simulator.

Visitors submit builds from the browser (web/src/app/api/sim-scores); the damage they send is never
trusted. This takes rows from the deeparam-sim D1 database (table submissions), checks each build is
legal, simulates it with the default settings on the live patch against the Survival enemy (the same for
every champion), and prints SQL that writes the result.

    python3 tools/verify_leaderboard.py rows.json > updates.sql

rows.json is the query result: a JSON list of {id, champion, items, augments} with items and augments
as comma-separated keys (or {"results": [...]}). Pass verified rows too after a new live patch: they
are simulated again and keep their place with the new numbers.
"""
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SIM = ROOT / "mayhem_sim"
# Survival: every champion fights the same enemy with its most popular build, until it dies (the default
# fight). Ashe is the most picked enemy; Ashe herself fights Teemo. Keep in step with SURVIVAL in
# viewer/sim-panel.js and the Survival tab's text (web/src/components/SimLeaderboard.tsx).
SURVIVAL_ENEMY, SURVIVAL_FALLBACK = "Ashe", "Teemo"


def sim(*args):
    out = subprocess.run([str(SIM), *args], cwd=ROOT, capture_output=True, text=True)
    return out.returncode, out.stdout, out.stderr.strip()


def sql(v):
    if v is None:
        return "NULL"
    if isinstance(v, (int, float)):
        return repr(round(float(v), 4))
    return "'" + str(v).replace("'", "''") + "'"


def check(row, meta):
    """The champion's canonical id if the build is legal, else (None, reason)."""
    champ = meta["champions"].get(str(row["champion"]).lower())
    if not champ:
        return None, "unknown champion"
    items = [k for k in str(row["items"]).split(",") if k]
    augs = [k for k in str(row.get("augments") or "").split(",") if k]
    if not items or len(items) > 6 or len(set(items)) != len(items):
        return None, "items"
    if any(k not in meta["items"] for k in items):
        return None, "unknown item"
    if sum(meta["items"][k]["slot"] == "boots" for k in items) > 1:
        return None, "two boots"
    if len(augs) > 4 or len(set(augs)) != len(augs) or any(a not in champ["augments"] for a in augs):
        return None, "augments"
    return champ["id"], None


def main():
    rows = json.load(open(sys.argv[1]))
    if isinstance(rows, dict):
        rows = rows.get("results", rows.get("rows", []))
    code, out, err = sim("--list", "--json")
    if code:
        sys.exit(err)
    raw = json.loads(out)
    meta = {
        "champions": {c["id"].lower(): c for c in raw["champions"]},
        "items": {i["key"]: i for i in raw["items"]},
    }
    patch = (ROOT / "data" / "tuned_patch.txt").read_text().strip()
    for row in rows:
        champ, why = check(row, meta)
        if not champ:
            print(f"UPDATE submissions SET status = 'rejected', verified_at = datetime('now') WHERE id = {int(row['id'])}; -- {why}")
            continue
        enemy = SURVIVAL_FALLBACK if champ == SURVIVAL_ENEMY else SURVIVAL_ENEMY
        args = ["--champ", champ, "--json", "--items", row["items"], "--team", enemy]
        if row.get("augments"):
            args += ["--augs", row["augments"]]
        code, out, err = sim(*args)
        if code:
            print(f"UPDATE submissions SET status = 'rejected', verified_at = datetime('now') WHERE id = {int(row['id'])}; -- {err[:80]}")
            continue
        s = json.loads(out)["builds"][0]["summary"]
        print(
            f"UPDATE submissions SET status = 'verified', champion = {sql(champ)}, verified_dps = {sql(s['mean_dps'])}, "
            f"survival = {sql(s['survival_rate'])}, time_alive = {sql(s['time_alive'])}, patch = {sql(patch)}, "
            f"verified_at = datetime('now') WHERE id = {int(row['id'])};"
        )


if __name__ == "__main__":
    main()
