"""Champion pages data: champions/data.js and champions/skins.js (champions/build_data.py), and the builder's
build-row helpers."""
import math
import os
import re

import pytest

from deeparam_data_helpers import REPO, TIERS, load_js_data, load_json, load_module, read, walk_numbers

SLOTS = ["P", "Q", "W", "E", "R"]
ROLES = {"assassin", "fighter", "mage", "marksman", "support", "tank"}
BUILD_KEYS = ("start", "boots", "first", "core", "full")
STYLES = {"crit", "onhit", "ap", "lethality", "fighter", "tank", "enchanter"}
STORMRAZOR_TENCENT, STORMRAZOR = 3097, 3095


@pytest.fixture(scope="module")
def data():
    return load_js_data("champions/data.js", "CHAMPS_DATA")


@pytest.fixture(scope="module")
def skins():
    return load_js_data("champions/skins.js", "CHAMPS_SKINS")


def all_build_rows(b):
    for k in BUILD_KEYS:
        yield from b[k]
    for st in b["styles"]:
        yield from st["core"]
        yield from st["full"]


def all_build_items(b):
    for r in all_build_rows(b):
        yield from r["items"]
    for st in b["styles"]:
        yield from st["items"]


def test_top_level(data):
    assert set(data) == {"patch", "champions", "items", "augments"}
    assert re.match(r"^\d+\.\d+\.\d+$", data["patch"])
    assert read("champions/data.js").startswith("window.CHAMPS_DATA = ")  # no header comment (5879fa77)


def test_numbers_are_finite(data):
    for path, n in walk_numbers(data):
        assert math.isfinite(n), path


def test_champion_identity(data):
    champs = data["champions"]
    assert len(champs) >= 150
    for key in ("id", "alias", "name"):
        vals = [c[key] for c in champs]
        assert len(vals) == len(set(vals)), f"duplicate champion {key}"
    names = [c["name"] for c in champs]
    assert names == sorted(names)
    for c in champs:
        assert isinstance(c["id"], int) and 0 < c["id"] < 10000, c["alias"]  # 60000+ are another mode's copies
        assert re.match(r"^[A-Za-z]+$", c["alias"]), c["alias"]
        assert c["roles"] and set(c["roles"]) <= ROLES, c["alias"]
        for k in ("icon", "splash", "tile", "vo"):
            assert c[k] and c[k].startswith("/assets/cd/"), (c["alias"], k)


def test_abilities(data):
    for c in data["champions"]:
        assert [a["slot"] for a in c["abilities"]] == SLOTS, c["alias"]
        for a in c["abilities"]:
            assert a["name"], (c["alias"], a["slot"])
            assert a["icon"] is None or a["icon"].startswith("/assets/")
            if a["slot"] != "P":
                n = 3 if a["slot"] == "R" else 5
                assert len(a["cooldown"]) <= n, (c["alias"], a["slot"])
                assert all(x >= 0 for x in a["cooldown"]), (c["alias"], a["slot"])


def test_base_stats(data):
    for c in data["champions"]:
        s = c["stats"]
        assert s, c["alias"]
        assert s["hp"][0] > 0 and s["ad"][0] > 0 and s["ms"] > 0 and s["range"] > 0, c["alias"]
        assert 0 < s["as"][0] < 2, c["alias"]
        for k in ("hp", "hp5", "ad", "as", "armor", "mr"):
            assert len(s[k]) == 2 and min(s[k]) >= 0, (c["alias"], k)
        if "resource" in s:
            assert s["resource"]["kind"] in ("Mana", "Energy")
            assert s["resource"]["base"][0] > 0


def test_mayhem_changes(data):
    for c in data["champions"]:
        rows = c["mayhem"]
        for r in rows:
            assert r["slot"] in SLOTS
            assert r["rift"] != r["mayhem"], (c["alias"], r)
            if r["slot"] in ("Q", "W", "E"):
                assert len(r["mayhem"]) <= 5
            if r["slot"] == "R":
                assert len(r["mayhem"]) <= 3
        order = ["Q", "W", "E", "R", "P"]  # the builder's slot order
        keys = [(order.index(r["slot"]), r["name"] != "Cooldown", r["name"]) for r in rows]
        assert keys == sorted(keys), c["alias"]


def test_tier_rows(data):
    for c in data["champions"]:
        t = c["tier"]
        if t is None:
            continue
        assert 1 <= t["rank"] <= t["of"], c["alias"]
        for k in ("winRate", "pickRate", "damage", "tank"):
            assert 0 <= t[k] <= 1, (c["alias"], k)
    ranks = [c["tier"]["rank"] for c in data["champions"] if c["tier"]]
    assert len(ranks) == len(set(ranks))


def test_build_rows(data):
    for c in data["champions"]:
        b = c["builds"]
        if b is None:
            continue
        assert re.match(r"^\d{4}-\d{2}-\d{2}$", b["date"])
        assert len(b["start"]) <= 5 and len(b["boots"]) <= 4 and len(b["first"]) <= 8
        assert len(b["core"]) <= 6 and len(b["full"]) <= 6
        assert not any(k.startswith("_") for k in b), "builder-only inputs are dropped before writing"
        for r in all_build_rows(b):
            assert r["items"], c["alias"]
            assert 0 <= r["pick"] <= 1 and 0 <= r["win"] <= 1, (c["alias"], r)
        for k in BUILD_KEYS:
            sets = [tuple(r["items"]) for r in b[k]]
            assert len(sets) == len(set(sets)), f"{c['alias']} {k}: rows with the same items are merged"
        starts = [r["pick"] for r in b["start"]]
        assert starts == sorted(starts, reverse=True)
        for tier, rows in b["augments"].items():
            assert tier in ("prismatic", "gold", "silver")
            assert len(rows) <= 10
            for a in rows:
                assert 0 <= a["pick"] <= 1 and a["grade"] in ("S", "A", "B", "C", "D", "")
        for s in b["skills"]:
            assert re.match(r"^[QWE]{3}$", s["max"]) or re.match(r"^[QWER]+$", s["max"]), s
            for o in s["orders"]:
                assert re.match(r"^[QWER]+$", o["levels"]) and len(o["levels"]) <= 18
        for m in b["mates"]:
            assert 0 <= m["win"] <= 1 and 0 <= m["pick"] <= 1


def test_build_styles(data):
    for c in data["champions"]:
        b = c["builds"]
        if not b:
            continue
        shares = [st["share"] for st in b["styles"]]
        assert shares == sorted(shares, reverse=True), c["alias"]
        assert sum(shares) <= 1.0001
        assert len({st["style"] for st in b["styles"]}) == len(b["styles"])
        for st in b["styles"]:
            assert st["style"] in STYLES and st["label"]
            assert 0 <= st["win"] <= 1
            assert len(st["core"]) <= 3 and len(st["full"]) <= 2 and len(st["items"]) <= 4 and len(st["augments"]) <= 6


def test_every_build_item_has_name_and_icon(data):
    """A build item missing from the item map shows as a blank slot on the page (the Stormrazor bug, af506266)."""
    items = data["items"]
    for iid, it in items.items():
        assert iid.isdigit() and it["name"] and it["icon"] and it["icon"].startswith("/assets/"), iid
    missing = {(c["alias"], i) for c in data["champions"] if c["builds"]
               for i in all_build_items(c["builds"]) if str(i) not in items}
    assert not missing


def test_every_build_augment_has_name_and_icon(data):
    augs = data["augments"]
    for aid, a in augs.items():
        assert aid.isdigit() and a["name"] and a["tier"] in TIERS + ("",), aid
        assert a["icon"] is None or a["icon"].startswith("/assets/")
    for c in data["champions"]:
        b = c["builds"]
        if not b:
            continue
        used = [a["id"] for rows in b["augments"].values() for a in rows] + [a for st in b["styles"] for a in st["augments"]]
        assert all(str(a) in augs for a in used), c["alias"]


def test_teammates_are_champions(data):
    ids = {c["id"] for c in data["champions"]}
    for c in data["champions"]:
        if c["builds"]:
            for m in c["builds"]["mates"]:
                assert m["id"] in ids and m["id"] != c["id"], (c["alias"], m)


def test_stormrazor_uses_client_id(data):
    """af506266 (#97): build stats name Stormrazor 3097, the game uses 3095."""
    assert str(STORMRAZOR_TENCENT) not in data["items"]
    for c in data["champions"]:
        if c["builds"]:
            assert STORMRAZOR_TENCENT not in set(all_build_items(c["builds"])), c["alias"]


def test_quest_reward_items_left_out_of_builds(data):
    """9d1ef617 (#156): items only an augment hands out can't be bought, so builds leave them out."""
    reward = {g["id"] for g in load_json("guide/augment_rules.json")["grantedItems"] if g["how"] == "reward"}
    assert reward
    for c in data["champions"]:
        if c["builds"]:
            assert not reward & set(all_build_items(c["builds"])), c["alias"]


def test_skins(data, skins):
    ids = {str(c["id"]) for c in data["champions"]}
    assert set(skins) == ids
    for cid, rows in skins.items():
        assert rows and rows[0]["name"] == "Original", cid
        assert sum(1 for r in rows if r["name"] == "Original") == 1, cid
        for r in rows:
            assert r["name"] and r["tile"].startswith("/assets/cd/"), cid


def test_champion_list_matches_site_ids(data):
    """The web app's id table (web/src/data/champion-ids.json) covers the same champions as the champion pages."""
    ids = load_json("web/src/data/champion-ids.json")
    for c in data["champions"]:
        assert ids.get(c["alias"]) == c["id"], c["alias"]
    # the only extras are another mode's copies (ids 60000+)
    assert all(ids[a] >= 60000 for a in set(ids) - {c["alias"] for c in data["champions"]})


# Known bug: champion-names.json spells Fiddlesticks' key "Fiddlesticks", but the stats (data/cn/champions.csv,
# by_patch.csv) and champion pages use the alias "FiddleSticks", so the Tier List's name lookup misses and the
# page falls back to the raw alias ("FiddleSticks" / "Fiddle Sticks").
KNOWN_MISSING_NAMES = {"FiddleSticks"}


def test_every_stats_alias_has_a_display_name(data):
    """Pages look champion names up by the alias the stats files use (web/src/data/champion-names.json)."""
    import csv
    names = load_json("web/src/data/champion-names.json")
    with open(os.path.join(REPO, "data", "cn", "champions.csv"), encoding="utf-8") as f:
        aliases = {r["name"] for r in csv.DictReader(f)} | {c["alias"] for c in data["champions"]}
    missing = {a for a in aliases if a not in names}
    assert not missing - KNOWN_MISSING_NAMES, sorted(missing - KNOWN_MISSING_NAMES)
    for c in data["champions"]:
        if c["alias"] in names:
            assert names[c["alias"]] == c["name"], c["alias"]
    if missing:
        pytest.xfail(f"champion-names.json has no entry for {sorted(missing)}")


# ---------- champions/build_data.py helpers ----------

@pytest.fixture(scope="module")
def builder():
    return load_module("champions/build_data.py", "deeparam_champions_build_data")


def test_item_alias_maps_stormrazor(builder):
    assert builder.ITEM_ALIASES == {STORMRAZOR_TENCENT: STORMRAZOR}


def test_build_rows_maps_aliases_and_merges(builder, monkeypatch):
    monkeypatch.setattr(builder, "REWARD_ITEMS", {9999})
    rows = [
        {"items": [3097, 3006], "pick_rate": 0.2, "win_rate": 0.5},
        {"items": [3095, 3006], "pick_rate": 0.1, "win_rate": 0.8},   # same set once 3097 is mapped
        {"items": [9999, 3006], "pick_rate": 0.3, "win_rate": 0.6},   # reward item dropped -> [3006]
        {"items": [9999], "pick_rate": 0.4, "win_rate": 0.4},         # nothing left: dropped
    ]
    out = builder.build_rows(rows, 10)
    assert out[0] == {"items": [3095, 3006], "pick": pytest.approx(0.3), "win": pytest.approx(0.6)}
    assert out[1] == {"items": [3006], "pick": 0.3, "win": 0.6}
    assert len(out) == 2
    assert builder.build_rows(rows, 1) == out[:1]
    assert builder.build_rows(None, 5) == []


def test_ranks_trim_to_ability_ranks(builder):
    assert builder.ranks([0, 1, 2, 3, 4, 5, 6], "Q") == [1, 2, 3, 4, 5]
    assert builder.ranks([0, 1, 2, 3, 4, 5, 6], "R") == [1, 2, 3]
    assert builder.ranks([0, 1.23456, None], "P") == [1.2346]


def test_build_style(builder):
    items = {1: {"categories": ["CriticalStrike"]}, 2: {"categories": ["SpellDamage"]},
             3: {"categories": ["SpellDamage"]}, 4: {"categories": ["Boots"]}}
    assert builder.build_style([1, 2, 3, 4], items) == "ap"
    assert builder.build_style([1, 2], items) == "crit"  # ties go to the earlier style
    assert builder.build_style([4], items) is None
