"""The Lab (tools/fun/): each calculator's generated data.js (tools/fun/*/build_data.py via tools/fun/cdragon.py)."""
import glob
import json
import math
import os
import re

import pytest

from deeparam_data_helpers import (REPO, TIERS, champion_aliases, champion_names, js_var, load_js_data, load_json,
                                   read, walk_numbers)

TOOLS = {
    "augment-odds": "ODDS_DATA",
    "biggest-champion": "SIZE_DATA",
    "cook-builds": "COOK_DATA",
    "gold-rush": "GOLD_DATA",
    "heartsteel": "HEARTSTEEL_DATA",
    "move-speed": "SPEED_DATA",
    "one-shot": "ONESHOT_DATA",
    "ryze-calculator": "RYZE_DATA",
    "stacking-timer": "STACKING_DATA",
    "zero-cooldowns": "COOLDOWN_DATA",
}
GAME_TOOLS = sorted(t for t in TOOLS if t != "cook-builds")


def data(tool):
    return load_js_data(f"tools/fun/{tool}/data.js", TOOLS[tool])


def test_every_tool_folder_is_covered():
    folders = {os.path.basename(os.path.dirname(p)) for p in glob.glob(os.path.join(REPO, "tools", "fun", "*", "data.js"))}
    assert folders == set(TOOLS)


@pytest.mark.parametrize("tool", sorted(TOOLS))
def test_parses_and_ships_without_header(tool):
    assert js_var(f"tools/fun/{tool}/data.js") == TOOLS[tool]
    # 172b6e1d: no "Generated from ... by build_data.py" comment in shipped data
    assert read(f"tools/fun/{tool}/data.js").startswith(f"window.{TOOLS[tool]} = ")


@pytest.mark.parametrize("tool", sorted(TOOLS))
def test_numbers_finite(tool):
    for path, n in walk_numbers(data(tool)):
        assert math.isfinite(n), path


def _minor(patch):
    return tuple(int(x) for x in patch.split(".")[:2])


@pytest.mark.parametrize("tool", GAME_TOOLS)
def test_patch_is_a_live_patch(tool):
    """Built from the live channel, never ahead of the champion pages (which the daily job rebuilds)."""
    d = data(tool)
    assert re.match(r"^\d+\.\d+\.\d+$", d["patch"])
    assert d["channel"] == "latest"
    assert _minor(d["patch"]) <= _minor(load_js_data("champions/data.js")["patch"])


@pytest.mark.parametrize("tool", GAME_TOOLS)
def test_champions_items_augments(tool):
    d = data(tool)
    aliases, names = champion_aliases(), champion_names()
    rules = load_json("guide/augment_rules.json")["tiers"]
    for c in d.get("champions") or []:
        assert c["alias"] in aliases and c["name"] in names, c
        assert c["icon"].startswith("/assets/cd/")
    if isinstance(d.get("champions"), list):
        al = [c["alias"] for c in d["champions"]]
        assert len(al) == len(set(al))
    items = d.get("items") or []
    ids = [i["id"] for i in items]
    assert len(ids) == len(set(ids))
    for i in items:
        assert i["name"] and i["price"] >= 0 and i["icon"].startswith("/assets/"), i["id"]
    augs = d.get("augments") or []
    keys = [a["key"] for a in augs]
    assert len(keys) == len(set(keys))
    for a in augs:
        assert a["name"] and a["tier"] in TIERS and a["icon"].startswith("/assets/"), a["key"]
        if "id" in a and str(a["id"]) in rules:
            assert rules[str(a["id"])] == a["tier"], (tool, a["key"])


def test_augment_odds_pool_matches_game_rules():
    d = data("augment-odds")
    rules = load_json("guide/augment_rules.json")
    counts = {t: sum(1 for a in d["augments"] if a["tier"] == t) for t in TIERS}
    assert counts == {t: o["pool"] for t, o in rules["odds"].items()}
    assert d["cards"] == {t: rules["cards"] for t in TIERS}
    assert d["rerolls"] == rules["rerollsPerSlot"]


def test_augment_odds_art_is_inline():
    art = load_js_data("tools/fun/augment-odds/art.js", "ODDS_ART")
    assert set(art) == {"card"} | {f"{k}_{t.lower()}" for k in ("back", "frame") for t in TIERS}
    for k, v in art.items():
        assert v.startswith("data:image/"), k


def test_zero_cooldowns_spells():
    for c in data("zero-cooldowns")["champions"]:
        keys = [s["key"] for s in c["spells"]]
        assert keys and set(keys) <= {"P", "Q", "W", "E", "R"} and len(keys) == len(set(keys)), c["alias"]
        for s in c["spells"]:
            assert all(x >= 0 for x in s["cd"]), (c["alias"], s["key"])


def test_size_and_speed_ranges():
    for c in data("biggest-champion")["champions"]:
        assert c["radius"] > 0 and c["collision"] > 0, c["alias"]
    for c in data("move-speed")["champions"]:
        assert 250 <= c["ms"] <= 400 and c["range"] > 0, c["alias"]
    for c in data("one-shot")["champions"]:
        assert c["hp"] > 0 and c["ar"] >= 0 and c["mr"] >= 0, c["alias"]


def test_gold_rush_income():
    inc = data("gold-rush")["income"]
    assert inc["startingGold"] > 0 and inc["passiveGold"] > 0 and inc["passiveInterval"] > 0
    assert all(v > 0 for v in inc["minionGold"].values())
    for i in data("gold-rush")["items"]:
        assert all(isinstance(p, int) and p > 0 for p in i.get("parts", [])), i["id"]


def test_site_tab_manifest():
    m = json.loads(read("tools/fun/site-tab.json"))
    assert m["label"] and m["entry"] == "index.html" and isinstance(m["order"], int)
    assert os.path.exists(os.path.join(REPO, "tools", "fun", m["entry"]))
    for folder in ("guide", "champions"):
        mm = json.loads(read(f"{folder}/site-tab.json"))
        assert os.path.exists(os.path.join(REPO, folder, mm["entry"]))


def test_lab_index_links_every_tool():
    html = read("tools/fun/index.html")
    for tool in TOOLS:
        assert re.search(rf"['\"/]{re.escape(tool)}[/'\"#]", html) or tool in html, tool
