#!/usr/bin/env python3
"""Writes src/data/challenges.json: challenge names and short descriptions, and title names by title id.

The account page uses it to name the challenge tokens and title a player shows off (O21). The Riot API
gives only ids for those (challenges-v1 player-data "preferences"), so the names come from the game
client's challenge list on CommunityDragon. Run after a patch: python3 web/scripts/challenge_names.py
"""
import json
import pathlib
import urllib.request

SOURCE = "https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/challenges.json"
OUT = pathlib.Path(__file__).resolve().parent.parent / "src" / "data" / "challenges.json"


def main() -> None:
    req = urllib.request.Request(SOURCE, headers={"User-Agent": "deeparam-scripts"})
    with urllib.request.urlopen(req, timeout=60) as r:
        data = json.load(r)
    challenges = {
        cid: [c["name"], c.get("descriptionShort") or c.get("description") or ""]
        for cid, c in sorted(data["challenges"].items(), key=lambda kv: int(kv[0]))
        if c.get("name")
    }
    titles = {str(t["itemId"]): t["name"] for t in sorted(data["titles"].values(), key=lambda t: t["itemId"]) if t.get("name")}
    OUT.write_text(json.dumps({"challenges": challenges, "titles": titles}, ensure_ascii=False, separators=(",", ":")) + "\n")
    print(f"{len(challenges)} challenges, {len(titles)} titles -> {OUT}")


if __name__ == "__main__":
    main()
