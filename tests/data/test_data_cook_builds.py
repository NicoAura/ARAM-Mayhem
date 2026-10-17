"""Cook builds: hand-written data/cook-builds/builds.json and the generated tools/fun/cook-builds/data.js
(data/cook-builds/build_data.py), plus the builder's text and tier helpers."""
import os

import pytest

from deeparam_data_helpers import REPO, TIERS, champion_aliases, load_js_data, load_json, load_module

PAGE = os.path.join(REPO, "tools", "fun", "cook-builds")
TIER_NAMES = {"Secretly strong", "Holds up", "Pure troll", "Untested"}


@pytest.fixture(scope="module")
def src():
    return load_json("data/cook-builds/builds.json")


@pytest.fixture(scope="module")
def page():
    return load_js_data("tools/fun/cook-builds/data.js", "COOK_DATA")


def test_source_builds(src):
    ids = [b["id"] for b in src["builds"]]
    assert ids and len(ids) == len(set(ids))
    for b in src["builds"]:
        assert b["champion"] in champion_aliases(), b["id"]
        assert 1 <= b["core"] <= len(b["augments"]) <= 6, b["id"]
        assert len(set(b["augments"])) == len(b["augments"]), b["id"]
        assert 1 <= len(b["items"]) <= 6, b["id"]
        assert b["title"] and b["why"] and b["play"]


def test_generated_matches_source(src, page):
    """data.js is regenerated from builds.json: same builds, same order, same hand-written fields."""
    assert [b["id"] for b in page["builds"]] == [b["id"] for b in src["builds"]]
    for s, g in zip(src["builds"], page["builds"]):
        for k in ("champion", "title", "core", "items", "why", "play"):
            assert g[k] == s[k], (s["id"], k)
        assert [a["name"] for a in g["augments"]] == s["augments"], s["id"]


def test_generated_build_fields(page, src):
    overrides = src.get("augment_text", {})
    for b in page["builds"]:
        rows = b["augments"]
        assert [r["core"] for r in rows] == [i < b["core"] for i in range(len(rows))], b["id"]
        for r in rows:
            assert r["rarity"] in TIERS, (b["id"], r["name"])
            assert r["text"] and "@" not in r["text"] and "{{" not in r["text"], (b["id"], r["name"])
            if r["name"] in overrides:
                assert r["text"] == overrides[r["name"]]
            for k in ("win_rate", "pick_rate"):
                assert r[k] is None or 0 <= r[k] <= 1
            assert r["champion_is_best"] == (b["champion"] in r["best_champions"]), (b["id"], r["name"])
        assert 0 <= b["core_usual"] <= b["core"]
        assert b["champion_win_rank"] >= 1
        assert b["tier"] in TIER_NAMES


def test_tier_follows_core_win_rate(page):
    """README: Secretly strong at 55.5%+, Holds up from 51.5%, Pure troll below; core = average of core augments."""
    for b in page["builds"]:
        rated = [r["win_rate"] for r in b["augments"] if r["core"] and r["win_rate"] is not None]
        if not rated:
            assert b["core_win_rate"] is None and b["tier"] == "Untested"
            continue
        assert b["core_win_rate"] == pytest.approx(round(sum(rated) / len(rated), 4))
        wr = b["core_win_rate"]
        expected = "Secretly strong" if wr >= 0.555 else "Holds up" if wr >= 0.515 else "Pure troll"
        assert b["tier"] == expected, b["id"]


def test_relative_icons_exist(page):
    for b in page["builds"]:
        icons = [b["champion_icon"]] + [r["icon"] for r in b["augments"]]
        for icon in icons:
            assert not icon.startswith(("/", "http")), icon  # the page ships its own copies
            assert os.path.isfile(os.path.join(PAGE, icon)), icon


def test_sim_numbers(page):
    for b in page["builds"]:
        sim = b.get("sim")
        if not sim:
            continue
        assert sim["dps"] >= 0 and sim["best_dps"] > 0
        assert 0 <= sim["survival"] <= 1 and 0 <= sim["best_survival"] <= 1
        assert sim["pct_of_best"] == pytest.approx(sim["dps"] / sim["best_dps"], abs=0.01)


def test_meta(page):
    m = page["meta"]
    assert m["champion_count"] > 100 and m["augment_count"] > 100
    assert len(m["cn_augment_date"]) == 8 and m["cn_augment_date"].isdigit()


# ---------- data/cook-builds/build_data.py helpers ----------

@pytest.fixture(scope="module")
def builder():
    return load_module("data/cook-builds/build_data.py", "deeparam_cook_build_data")


def test_tier_thresholds(builder):
    assert builder.tier(None) == "Untested"
    assert builder.tier(0.555) == "Secretly strong"
    assert builder.tier(0.5549) == "Holds up"
    assert builder.tier(0.515) == "Holds up"
    assert builder.tier(0.5149) == "Pure troll"


def test_slug(builder):
    assert builder.slug("Draw Your Sword!") == "draw-your-sword"
    assert builder.slug("  Wit's End ") == "wit-s-end"


def test_augment_text(builder):
    s = {"Kiwi_Thing_Name": "Nested"}.get
    out = builder.augment_text("Gain @AD*100@% AD and @Missing@ AP.<br>Damage Dealt: @f1@", {"AD": 0.24}, s)
    assert out == "Gain 24% AD and AP."
    assert builder.augment_text("Your {{ SpellName }} hits", {}, s) == "Your chosen ability hits"
    assert builder.augment_text("{{ Kiwi_Thing_Name }} {{Item_Keyword_OnHit}} damage", {}, s) == "Nested On-Hit damage"
    assert builder.augment_text("Text --- tail", {}, s) == "Text"


def test_best_text_prefers_fewer_gaps(builder):
    s = {}.get
    long = "Gain @A@ and @B@ and @C@ stuff"
    short = "Gain @X@ stuff"
    assert builder.best_text([long, short], {"X": 3}, s) == "Gain 3 stuff"
    assert builder.best_text(["", None], {}, s) == ""
