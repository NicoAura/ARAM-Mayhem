"""Write guide/game_constants.json: Riot's official IDs and names for the ARAM and Mayhem queues and maps.

Usage: python3 guide/build_constants.py

Reads Riot's developer constants (static.developer.riotgames.com/docs/lol/{queues,maps,gameModes,seasons}.json), the
same lists the Riot API's match data uses. build_data.py takes the public Mayhem queue id from here, and My Stats and
the site can use it in place of hard-coded ids. The client's own queue list (guide/data.js "queues") also has
internal Mayhem queues (tournament and test ids) that the official list leaves out.
"""
import json, os, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
DOCS = "https://static.developer.riotgames.com/docs/lol"
ARAM_MAPS = ("Howling Abyss", "Butcher's Bridge")


def get(name):
    req = urllib.request.Request(f"{DOCS}/{name}.json", headers={"User-Agent": "deeparam-guide"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def main():
    queues, maps, modes = get("queues"), get("maps"), get("gameModes")
    aram = [q for q in queues if q.get("map") in ARAM_MAPS and "deprecated" not in (q.get("notes") or "").lower()]
    mayhem = [q["queueId"] for q in aram if "Mayhem" in (q.get("description") or "")]
    out = {
        "mayhemQueue": mayhem[0] if mayhem else None,
        "mayhemQueues": mayhem,
        "queues": [{"id": q["queueId"], "map": q["map"], "name": q["description"]} for q in aram],
        "maps": [{"id": m["mapId"], "name": m["mapName"]} for m in maps if m["mapName"] in ARAM_MAPS],
        "gameModes": [m["gameMode"] for m in modes if "ARAM" in m["gameMode"]],
    }
    with open(os.path.join(HERE, "game_constants.json"), "w") as f:
        json.dump(out, f, indent=1, ensure_ascii=False)
        f.write("\n")
    print(f"Mayhem queue {out['mayhemQueue']}; {len(out['queues'])} ARAM queues, {len(out['maps'])} maps")


if __name__ == "__main__":
    main()
