"""Short against long fights: runs every champion's simulated best build
(viewer/replay-data/best-builds.json) and compares its damage per second over the first 6
seconds from its first hit (a short fight) with its damage per second over the first 20 (a long
one). Going down early counts against both.

Writes viewer/replay-data/fight-length.json:
  {"short_seconds": 6, "long_seconds": 20, "champions": [{champion, name, role, dps_short, dps_long, ratio, edge}]}
ratio > 1: the champion does more per second in long fights (stacks, ramping attack speed, sustain);
ratio < 1: it front-loads its damage (burst) or goes down before a long fight is over.
edge: the ratio against the median champion's (+0.2 = keeps 20% more of its damage rate in long fights).

  python3 tools/build_fight_length.py [--sim ./mayhem_sim] [--trials 1000]
"""
import argparse, concurrent.futures as cf, json, os, subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
ap = argparse.ArgumentParser()
ap.add_argument("--sim", default=os.path.join(ROOT, "mayhem_sim"))
ap.add_argument("--trials", default="1000")
ap.add_argument("--out", default=os.path.join(ROOT, "viewer", "replay-data", "fight-length.json"))
args = ap.parse_args()

best = json.load(open(os.path.join(ROOT, "viewer", "replay-data", "best-builds.json")))["champions"]
names = {c["id"]: c["name"] for c in json.loads(subprocess.check_output([args.sim, "--list", "--json"], cwd=ROOT))["champions"]}


def run(c):
    b = c["build"]
    keys = lambda xs: ",".join(x["key"] if isinstance(x, dict) else x for x in xs)
    cmd = [args.sim, "--champ", c["champion"], "--items", keys(b["items"]), "--trials", args.trials, "--json", "--threads", "1"]
    if b["augments"]:
        cmd += ["--augs", keys(b["augments"])]
    r = subprocess.run(cmd, capture_output=True, text=True, cwd=ROOT)
    if r.returncode:
        print(c["champion"], r.stderr.strip()[:200])
        return None
    s = json.loads(r.stdout)["builds"][0]["summary"]
    early, late = s["dps_short_fight"], s["dps_long_fight"]
    return {"champion": c["champion"], "name": names.get(c["champion"], c["champion"]), "role": c.get("role", ""),
            "dps_short": round(early, 1), "dps_long": round(late, 1),
            "ratio": round(late / early, 3) if early > 0 and late > 0 else None}


with cf.ThreadPoolExecutor(os.cpu_count() or 4) as ex:
    rows = [r for r in ex.map(run, best) if r and r["ratio"]]
# Everyone loses some damage per second over a long fight (fights end when you go down), so the
# edge compares each champion's ratio with the typical champion's: +20% keeps a fifth more of it.
mid = sorted(r["ratio"] for r in rows)[len(rows) // 2]
for r in rows:
    r["edge"] = round(r["ratio"] / mid - 1, 3)
rows.sort(key=lambda r: -r["ratio"])
json.dump({"short_seconds": 6, "long_seconds": 20, "champions": rows}, open(args.out, "w"), indent=1)
print(f"{len(rows)} champions -> {args.out}")
for r in rows[:5] + rows[-5:]:
    print(f"  {r['champion']:14s} {r['dps_short']:7.0f} -> {r['dps_long']:7.0f}  x{r['ratio']}")
