"""The Lab (tools/fun/): Infinite Ryze and Cook Builds generated data.js (tools/fun/*/build_data.py via tools/fun/cdragon.py)."""
import glob
import json
import math
import os
import re

import pytest

from deeparam_data_helpers import (REPO, TIERS, champion_aliases, champion_names, js_var, load_js_data, load_json,
                                   read, walk_numbers)

TOOLS = {
    "cook-builds": "COOK_DATA",
    "ryze-calculator": "RYZE_DATA",
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
