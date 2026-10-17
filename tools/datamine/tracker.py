"""Build the PBE tab's change tracker: every champion, item and augment change, each tagged
"buff", "nerf", "mixed", "neutral", "unclear", "new" or "removed".

    python3 tools/datamine/tracker.py [data/pbe/kiwi-s3.json] [data/pbe/tracker.json]

Tags come from the numbers in each "old → new" line: which way they moved, and whether that stat is
better higher (damage, ratios, health) or lower (cooldowns, costs). A line without numbers to compare
is "unclear". data/pbe/tracker-overrides.json maps an exact change line to the tag to use instead,
for the lines the numbers get wrong.
"""
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, "data", "pbe", "kiwi-s3.json")
OUT = os.path.join(ROOT, "data", "pbe", "tracker.json")
OVERRIDES = os.path.join(ROOT, "data", "pbe", "tracker-overrides.json")

# Stats where a smaller number is better for the player.
LOWER_BETTER = re.compile(r"cooldown(?! reset| refund)|recharge|\bcost\b|mana cost|\bgold\b|cast time|delay|lockout", re.I)
# Stats whose direction can't be read from the name alone.
UNKNOWN = re.compile(r"resource stat", re.I)

NUM_RUN = r"\d+(?:\.\d+)?(?:\s*[/–-]\s*\d+(?:\.\d+)?)*"
TAIL = re.compile(rf"({NUM_RUN})\s*(?:%|s|gold)?\s*$")
HEAD = re.compile(rf"^\s*\+?({NUM_RUN})")
INSTEAD = re.compile(rf"(?:at|to)\s+({NUM_RUN})\s*%?\s+instead of\s+({NUM_RUN})", re.I)


def nums(run):
    return [float(x) for x in re.findall(r"\d+(?:\.\d+)?", run)]


def movement(old, new):
    """+1 if every value went up, -1 if every value went down, 0 if they went both ways, None if unchanged."""
    if len(old) != len(new):
        if len(old) == 1:
            old = old * len(new)
        elif len(new) == 1:
            new = new * len(old)
        else:
            old, new = [old[0], old[-1]], [new[0], new[-1]]
    up = any(b > a for a, b in zip(old, new))
    down = any(b < a for a, b in zip(old, new))
    if up and down:
        return 0
    return 1 if up else -1 if down else None


def tag_line(text):
    """Tag one change line such as "Q cooldown 9/8/7s → 8/7/6s"."""
    text = re.sub(r"(?<=\d),(?=\d{3})", "", text)
    parts = re.split(r",\s+(?=[^,()]*→)", text)
    if len(parts) > 1:
        # "W on-hit 4/13 → 4/10, on-hit AP ratio 25% → 30%": tag each part.
        return overall([tag_line(p) for p in parts])
    low = text.lower()
    if re.search(r"\bremoved\b|\bcut\b", low):
        return "removed"
    if re.search(r"cosmetic|wording|look the same|same value|icon\b", low):
        return "neutral"
    old = new = None
    stat = text
    if "→" in text:
        left, right = text.split("→", 1)
        left = re.sub(r"\([^)]*\)", "", left)
        right = re.sub(r"\([^)]*\)", "", right)
        t, h = TAIL.search(left), HEAD.search(right)
        if t and h:
            old, new = nums(t.group(1)), nums(h.group(1))
            stat = left[: t.start()]
    else:
        m = INSTEAD.search(text)
        if m:
            new, old = nums(m.group(1)), nums(m.group(2))
            stat = text[: m.start()]
    if old is None or UNKNOWN.search(stat):
        return "unclear"
    move = movement(old, new)
    if move is None:
        return "neutral"
    if move == 0:
        return "mixed"
    if LOWER_BETTER.search(stat):
        move = -move
    return "buff" if move > 0 else "nerf"


def overall(tags):
    """One tag for a champion, item or augment from the tags of its lines."""
    s = set(tags)
    if s <= {"neutral"}:
        return "neutral"
    if s == {"removed"}:
        return "removed"
    if "mixed" in s or {"buff", "nerf"} <= s:
        return "mixed"
    if "buff" in s:
        return "buff"
    if "nerf" in s:
        return "nerf"
    return "unclear"


def build(d, fixes):
    def line(text, tag=None):
        return {"text": text, "tag": fixes.get(text) or tag or tag_line(text)}

    entries = []
    overrides = {}
    for o in d.get("championOverrides", []):
        text = f"Mayhem only, {o['ability']}: {o['live']} → {o['pbe']}"
        tag = o.get("direction") if o.get("direction") in ("buff", "nerf", "mixed") else None
        overrides.setdefault(o["champion"], []).append(line(text, tag or "unclear"))
    for c in d.get("championChanges", {}).get("list", []):
        lines = [line(x) for x in c["changes"]] + overrides.pop(c["champion"], [])
        entries.append({"kind": "champion", "name": c["champion"], "lines": lines})
    for name, lines in overrides.items():
        entries.append({"kind": "champion", "name": name, "lines": lines})
    for i in d.get("itemChanges", {}).get("list", []):
        entries.append({"kind": "item", "name": i["item"], "lines": [line(x) for x in i["changes"]]})

    aug = d.get("augments", {})
    direction = {"buff": "buff", "nerf": "nerf", "mixed": "mixed", "none": "neutral"}
    for a in aug.get("changed", []):
        lines = [line(f"{c['stat']}: {c['live']} → {c['pbe']}", direction.get(a.get("direction", ""))) for c in a["changes"]]
        entries.append({"kind": "augment", "name": a["name"], "tier": a.get("tier"), "icon": a.get("icon"), "lines": lines})
    for a in aug.get("added", []):
        text = a.get("description") or "Details not revealed yet."
        name = a.get("name") or "Unnamed augment"
        entries.append({"kind": "augment", "name": name, "tier": a.get("tier"), "icon": a.get("icon"), "set": a.get("set"),
                        "lines": [{"text": text, "tag": "new"}], "tag": "new"})
    for a in aug.get("removed", []):
        entries.append({"kind": "augment", "name": a["name"], "tier": a.get("tier"), "icon": a.get("icon"),
                        "lines": [{"text": "Removed from the augment pool.", "tag": "removed"}], "tag": "removed"})

    for e in entries:
        e["tag"] = fixes.get(f"{e['kind']}:{e['name']}") or e.get("tag") or overall([l["tag"] for l in e["lines"]])
    counts = {}
    for e in entries:
        counts[e["tag"]] = counts.get(e["tag"], 0) + 1
    meta = d.get("meta", {})
    return {"builds": meta.get("builds"), "dataAsOf": meta.get("dataAsOf"), "counts": counts, "entries": entries}


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else SRC
    out = sys.argv[2] if len(sys.argv) > 2 else OUT
    fixes = json.load(open(OVERRIDES)) if os.path.exists(OVERRIDES) else {}
    fixes = {k: v for k, v in fixes.items() if not k.startswith("_")}
    t = build(json.load(open(src)), fixes)
    with open(out, "w") as f:
        json.dump(t, f, ensure_ascii=False, indent=1)
        f.write("\n")
    print(out, t["counts"])


if __name__ == "__main__":
    main()
