#!/usr/bin/env python3
"""Gives every enemy in data/cn_enemy_pool.json its most popular full build: six items and
four augments (one per augment pick), from the champion's real Mayhem build statistics in
../data/cn/builds/<champion_id>.json. Only items and augments the simulator models count;
missing slots are filled with the champion's next most popular ones.

    python3 tools/build_enemy_builds.py
"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
SIM = os.path.dirname(HERE)
BUILDS = os.path.join(os.path.dirname(SIM), "data", "cn", "builds")
POOL = os.path.join(SIM, "data", "cn_enemy_pool.json")


def load(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def main():
    items = load(os.path.join(SIM, "data", "items.json"))["items"]
    augs = load(os.path.join(SIM, "data", "augments.json"))["augments"]
    item_key = {v["id"]: k for k, v in items.items()}
    aug_key = {v["id"]: k for k, v in augs.items() if v.get("stats") or v.get("effects")}
    boots = {k for k, v in items.items() if v.get("slot") == "boots"}
    pool = load(POOL)
    full_items = full_augs = 0
    for e in pool["enemies"]:
        path = os.path.join(BUILDS, f"{e['champion_id']}.json")
        if not os.path.exists(path):
            continue
        b = load(path)
        groups = b.get("items") or {}
        picked = []

        def add(ids):
            for i in ids:
                k = item_key.get(i)
                if k and k not in picked and len(picked) < 6 and not (k in boots and any(p in boots for p in picked)):
                    picked.append(k)
        # The most popular six-item build the simulator knows four or more items of, then
        # the rest of the champion's items by popularity.
        for fb in sorted(groups.get("full_builds", []), key=lambda x: -x.get("pick_rate", 0)):
            if sum(1 for i in fb["items"] if i in item_key) >= 4:
                add(fb["items"])
                break
        for grp in ("boots", "core", "other"):
            for entry in sorted(groups.get(grp, []), key=lambda x: -x.get("pick_rate", 0)):
                add(entry["items"])
        chosen_augs = []
        for a in sorted((b.get("augments") or {}).get("all", []), key=lambda x: -x.get("pick_rate", 0)):
            k = aug_key.get(a["id"])
            if k and k not in chosen_augs and len(chosen_augs) < 4:
                chosen_augs.append(k)
        e["build"] = {"items": picked, "augments": chosen_augs}
        full_items += len(picked) == 6
        full_augs += len(chosen_augs) == 4
    # A champion whose own list runs out of modelled augments takes the ones most often picked
    # by champions of its role.
    by_role = {}
    for e in pool["enemies"]:
        for k in (e.get("build") or {}).get("augments", []):
            by_role.setdefault(e.get("role"), {}).setdefault(k, 0)
            by_role[e.get("role")][k] += 1
    for e in pool["enemies"]:
        b = e.get("build")
        if b and len(b["augments"]) < 4:
            for k, _ in sorted(by_role.get(e.get("role"), {}).items(), key=lambda x: -x[1]):
                if len(b["augments"]) < 4 and k not in b["augments"]:
                    b["augments"].append(k)
    full_augs = sum(1 for e in pool["enemies"] if len((e.get("build") or {}).get("augments", [])) == 4)
    with open(POOL, "w", encoding="utf-8") as f:
        json.dump(pool, f, ensure_ascii=False, indent=1)
        f.write("\n")
    print(f"enemy builds: {len(pool['enemies'])} enemies, {full_items} with six items, {full_augs} with four augments")


if __name__ == "__main__":
    main()
