#!/usr/bin/env python3
"""Simulated damage per item, for the item pages (/items/<slug>).

For each item the simulator models, take the champions who build it most (data/cn/builds) and
their simulated best build (simulator/viewer/replay-data/best-builds.json). Start from that build
without the item (or without its last item, when the item isn't in it), then simulate it once more
with the item added. The difference is the damage the item adds to that champion's build.

Needs the native simulator: `make -C simulator mayhem_sim`.
Writes web/src/data/item-sim.json. Run from the repo root:
    python3 web/scripts/build_item_sim.py
"""

import json
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SIM = ROOT / "simulator" / "mayhem_sim"
OUT = ROOT / "web" / "src" / "data" / "item-sim.json"
TOP = 5  # champions per item
TRIALS = "1500"
SEED = "7"


def load(path):
    return json.loads((ROOT / path).read_text())


def dps(champ, items, augs):
    out = subprocess.run(
        [str(SIM), "--champ", champ, "--items", ",".join(items), "--augs", ",".join(augs),
         "--trials", TRIALS, "--seed", SEED, "--threads", "1", "--json"],
        capture_output=True, text=True, check=True, cwd=SIM.parent,
    ).stdout
    s = json.loads(out)["builds"][0]["summary"]
    return s["mean_dps"], s["time_alive"]


def main():
    if not SIM.exists():
        sys.exit("Build the simulator first: make -C simulator mayhem_sim")
    sim_items = load("simulator/data/items.json")["items"]
    slug_of = {v["id"]: k for k, v in sim_items.items() if v.get("slot") != "boots"}
    best = {c["champion"].lower(): c for c in load("simulator/viewer/replay-data/best-builds.json")["champions"]}
    ids = load("web/src/data/champion-ids.json")

    # Who builds each item most: single-item entries are how often a champion builds it at all.
    builders = {}
    for alias, cid in ids.items():
        c = best.get(alias.lower())
        f = ROOT / "data" / "cn" / "builds" / f"{cid}.json"
        if not c or not f.exists():
            continue
        for e in json.loads(f.read_text()).get("items", {}).get("other", []):
            if len(e["items"]) == 1 and e["items"][0] in slug_of:
                builders.setdefault(e["items"][0], []).append((e["pick_rate"], c))

    jobs = []
    for gid, rows in builders.items():
        slug = slug_of[gid]
        for _, c in sorted(rows, key=lambda r: -r[0])[:TOP]:
            items, augs = c["build"]["items"], c["build"]["augments"]
            base = [i for i in items if i != slug]
            if len(base) == len(items):
                base = base[:-1]
            jobs.append((gid, c["champion"], base, base + [slug], augs))

    def run(job):
        gid, champ, base, full, augs = job
        try:
            (b, ba), (f, fa) = dps(champ, base, augs), dps(champ, full, augs)
        except (subprocess.CalledProcessError, KeyError, json.JSONDecodeError) as err:
            print(f"skip {champ} {gid}: {err}", file=sys.stderr)
            return None
        return gid, {"champ": champ, "dps": round(f), "base": round(b), "alive": round(fa - ba, 1)}

    out = {}
    with ThreadPoolExecutor() as pool:
        for r in pool.map(run, jobs):
            if r:
                out.setdefault(str(r[0]), []).append(r[1])
    patch = (ROOT / "simulator" / "data" / "tuned_patch.txt").read_text().strip()
    OUT.write_text(json.dumps({"patch": patch, "items": dict(sorted(out.items()))}, separators=(",", ":")) + "\n")
    print(f"{len(out)} items, {sum(map(len, out.values()))} champion builds -> {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
