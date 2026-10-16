#!/usr/bin/env python3
"""Bundle the dashboard into one self-contained page for the published preview.

The preview can't load Riot's CDNs at runtime, so this inlines the CSS and JS,
and the champion and augment name tables. --sample adds an archive of generated
example games (labelled as examples on the page). Usage:

    python3 dashboard/build_preview.py OUT.html [--sample]
"""

import json
import random
import re
import sys
import urllib.request
from pathlib import Path

HERE = Path(__file__).parent
# The live client's game data, as mirrored by CommunityDragon
GAME_DATA = "https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/"
CDRAGON = GAME_DATA + "cherry-augments.json"


def get_json(url):
    # CommunityDragon refuses Python's default user agent
    req = urllib.request.Request(url, headers={"User-Agent": "aram-mayhem-preview"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def name_tables():
    champs = get_json(GAME_DATA + "champion-summary.json")
    augs = get_json(CDRAGON)
    augs = augs if isinstance(augs, list) else augs.get("augments", [])
    return (
        {str(c["id"]): c["name"] for c in champs if c["id"] > 0},
        {str(a["id"]): a["nameTRA"] for a in augs if a.get("nameTRA")},
        {str(a["id"]): a["rarity"] for a in augs if a.get("rarity")},
    )


def mayhem_augment_ids():
    """Ids of the augments in the client's Mayhem (KIWI) augment list."""
    lists = {l["modeName"]: l["augmentList"] for l in get_json(GAME_DATA + "augment-lists.json")}
    names = {path.rsplit("/", 1)[-1] for path in lists.get("KIWI", [])}
    return {str(a["id"]) for a in get_json(CDRAGON) if a.get("augmentNameId") in names}


def sample_kill_map(rng, kills, deaths, win):
    """Made-up kill positions along the Howling Abyss lane, pushed toward the enemy base in wins."""
    a, b = (1800, 1600), (11000, 11200)  # roughly the two bases, in game units

    def spot(bias):
        t = min(0.92, max(0.08, rng.gauss(0.5 + bias, 0.16)))
        off = rng.gauss(0, 550)
        return (round(a[0] + t * (b[0] - a[0]) - off * 0.7), round(a[1] + t * (b[1] - a[1]) + off * 0.7))

    events = []
    for _ in range(kills):
        x, y = spot(0.12 if win else 0.0)
        events.append([rng.randint(60, 1300), x, y, 1, rng.randint(6, 10)])
    for _ in range(deaths):
        x, y = spot(0.0 if win else -0.12)
        events.append([rng.randint(60, 1300), x, y, rng.randint(6, 10), 1])
    return sorted(events)


def sample_archive(champ_names, aug_names, aug_rarity, mayhem_ids, n=640, seed=7):
    """Example games in the League client's format. Not anyone's real history."""
    rng = random.Random(seed)
    me = {"puuid": "example-puuid", "gameName": "Example", "tagLine": "MHM"}
    champs = rng.sample(sorted(champ_names, key=int), 40)
    champ_weight = {c: rng.paretovariate(1.2) for c in champs}
    champ_skill = {c: rng.gauss(0, 0.08) for c in champs}
    pool = {r: [a for a, rr in aug_rarity.items() if rr == r and a in aug_names and a in mayhem_ids] for r in ("kSilver", "kGold", "kPrismatic")}
    aug_skill = {a: rng.gauss(0, 0.06) for ids in pool.values() for a in ids}
    t = 1792108800000  # 2026-10-16
    games = []
    for i in range(n):
        t -= int(rng.expovariate(1 / (7 * 3600 * 1000)))
        champ = rng.choices(champs, weights=[champ_weight[c] for c in champs])[0]
        augs = [rng.choice(pool[rng.choices(["kSilver", "kGold", "kPrismatic"], [5, 4, 2])[0]]) for _ in range(4)]
        if rng.random() < 0.2:
            augs.append(rng.choice(pool["kPrismatic"]))
        p_win = 0.53 + champ_skill[champ] + sum(aug_skill[a] for a in augs) / len(augs)
        win = rng.random() < p_win
        deaths = rng.randint(2, 14)
        stats = {
            "win": win,
            "kills": max(0, int(rng.gauss(13 if win else 9, 6))),
            "deaths": deaths,
            "assists": max(0, int(rng.gauss(24 if win else 18, 8))),
            "totalDamageDealtToChampions": int(rng.gauss(52000 if win else 44000, 14000)),
        }
        for k in range(6):
            stats[f"playerAugment{k + 1}"] = int(augs[k]) if k < len(augs) else 0
        games.append({
            "killMap": sample_kill_map(random.Random(seed * 1000 + i), stats["kills"], deaths, win),
            "gameId": 5_400_000_000 - i * 7919,
            "queueId": 2400 if rng.random() < 0.85 else 2450,
            "gameCreation": t,
            "gameVersion": f"16.{max(1, 20 - i // 40)}.1",
            "gameDuration": int(rng.gauss(1150, 160)),
            "participants": [{"participantId": 1, "championId": int(champ), "teamId": 100, "stats": stats}],
            "participantIdentities": [{"participantId": 1, "player": me}],
        })
    return {"puuid": me["puuid"], "gameName": me["gameName"], "tagLine": me["tagLine"], "games": games}


def main():
    out = Path(sys.argv[1])
    champ_names, aug_names, aug_rarity = name_tables()
    preset = {
        "champNames": champ_names,
        "augNames": aug_names,
        "augRarity": aug_rarity,
    }
    if "--sample" in sys.argv:  # example games, off unless asked for
        preset["sample"] = sample_archive(champ_names, aug_names, aug_rarity,
                                          mayhem_augment_ids())
    html = (HERE / "index.html").read_text()
    body = re.search(r"<body>(.*)</body>", html, re.S).group(1)
    body = body.replace('<script src="app.js"></script>', "")
    title = re.search(r"<title>(.*?)</title>", html).group(1)
    fonts = re.search(r'<link rel="stylesheet" href="https://fonts\.googleapis\.com[^>]*>', html).group(0)
    page = (
        f"<title>{title}</title>\n"
        '<meta name="claude:viewport-fit-sides" content="cover">\n'
        f"{fonts}\n"
        f"<style>\n{(HERE / 'style.css').read_text()}</style>\n"
        f"{body}\n"
        f"<script>window.MAYHEM_PRESET = {json.dumps(preset, separators=(',', ':'))};</script>\n"
        f"<script>\n{(HERE / 'app.js').read_text()}</script>\n"
    )
    out.write_text(page)
    print(f"wrote {out} ({len(page) // 1024} KB)")


if __name__ == "__main__":
    main()
