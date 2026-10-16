#!/usr/bin/env python3
"""Works out, from a local League install, how each champion's model should animate and move.

Writes viewer/replay-data/anims.json (names and tags only, no Riot art, so it is committed):

  {champion: {"idle": [[clip, ...], ...],      first entry loops; the rest are idle variations
              "death": [clip, ...],
              "Q": {"casts": [[clip, ...], ...], successive casts take turns (Riven Q: A, B, C)
                    "move": "dash" | "blink" | null}, ... W E R}}

A clip is listed by every name the model might use for it: the animation graph's clip name and
the .anm file's name (models exported from the game use either), e.g. "Spell1A|riven_spell1a".

Animation: each champion's animation graph (data/characters/<c>/animations/skin0.bin) names
its clips (Spell1, Spell1A/B/C, Spell4_Windup, Spell4_Loop, Idle1, Idle2...) and builds some
from others (sequences, random selectors). A slot's cast plays its wind-up, main clip, loop and
hit clips in that order; transitions into run or idle and alternate forms are left out.

Movement: each spell's tags in the champion's data say whether it moves the champion:
PositiveEffect_Teleport is a blink and PositiveEffect_MoveBlock (the champion is carried by
the spell) a dash or leap. A spell that only sends a shadow (Zed W) has neither. The slot's
main spell decides; otherwise its recasts and parts (Lee Sin's second Q).

Needs: pip install cdtb zstandard xxhash and `cdtb fetch-hashes` once.

Usage:
  python3 tools/build_anim_data.py --index viewer/replay-data/index.json --out viewer/replay-data/anims.json
      [--root "/Applications/League of Legends.app/Contents/LoL"] [--only Riven,Zed]
"""
import argparse
import concurrent.futures as cf
import io
import json
import os
import re
import struct
import sys
from pathlib import Path

from cdtb.binfile import BinReader

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_game_sounds import DEFAULT_ROOTS, SLOTS, ChampionWads  # noqa: E402

SKIP = re.compile(r"(_?to_?(idle|run|walk)|_into_|_exit|exit_|_in\d*$|_in_|^idlein|_out$|run|walk|_-?\d+$|_base$|"
                  r"_(ult|passive|assassin|slayer|homeguard|haste)\b|_(ult|passive|assassin|slayer)$)")
PRE = re.compile(r"windup|wndup|charge|leadin|lead_in|start")
LOOP = re.compile(r"loop|channel|_idle$|hold")
POST = re.compile(r"hit|landing|land$|strike|shoot|slam|end$|circle|spin|finish")


def entries(data):
    """{path: serialized entry} for a bin, skipping entries cdtb can't read."""
    f = io.BytesIO(data)
    if f.read(4) == b"PTCH":
        f.read(8); f.read(4)
    reader = BinReader(f)
    _, _, types = reader.read_binfile_header()
    out = {}
    for htype in types:
        start = f.tell()
        length, = struct.unpack("<L", f.read(4))
        f.seek(start)
        try:
            e = reader.read_binfile_entry(htype)
        except Exception:
            f.seek(start + 4 + length)
            continue
        out[e.path.to_serializable()] = e.to_serializable()
    return out


class Graph:
    def __init__(self, clips):
        self.clips = clips

    def names(self, clip):
        """Every name the model may use for an atomic clip: the graph name and the .anm name."""
        x = self.clips[clip]
        path = (x.get("mAnimationResourceData") or {}).get("mAnimationFilePath") or ""
        base = os.path.basename(path)[:-4] if path.endswith(".anm") else ""
        return "|".join(n for n in dict.fromkeys([clip if not clip.startswith("{") else "", base]) if n)

    def resolve(self, clip, depth=0):
        """A clip as the list of atomic clips it plays in order (first option of a selector or condition)."""
        x = self.clips.get(clip)
        if not x or depth > 8:
            return []
        t = x.get("__type")
        if t == "AtomicClipData":
            n = self.names(clip)
            return [n] if n else []
        if t == "SequencerClipData":
            return [a for c in x.get("mClipNameList", []) for a in self.resolve(c, depth + 1)]
        if t == "SelectorClipData":
            opts = x.get("mSelectorPairDataList", [])
            return self.resolve(opts[0]["mClipName"], depth + 1) if opts else []
        if t == "ParallelClipData":
            lst = x.get("mClipNameList", [])
            return self.resolve(lst[0], depth + 1) if lst else []
        if t == "ConditionBoolClipData":
            return self.resolve(x.get("mFalseConditionClipName") or x.get("mTrueConditionClipName"), depth + 1)
        for key in ("mConditionFloatPairDataList", "mParametricPairDataList"):
            if x.get(key):
                lst = x[key]
                mid = next((p for p in lst if not p.get("mValue")), lst[0])
                return self.resolve(mid["mClipName"], depth + 1)
        return []

    def options(self, clip):
        """A selector's options as separate clips (idle variations), else the clip itself."""
        x = self.clips.get(clip) or {}
        if x.get("__type") == "SelectorClipData":
            return [o for p in x.get("mSelectorPairDataList", []) if (o := self.resolve(p["mClipName"]))]
        r = self.resolve(clip)
        return [r] if r else []


def idle(graph):
    names = sorted((n for n in graph.clips if re.fullmatch(r"idle\d*", n.lower())), key=lambda n: (len(n), n))
    out = []
    for n in names:
        for o in graph.options(n):
            core = o[-1:]           # a sequence opens with its lead-in; the idle itself is the last clip
            if core not in out:
                out.append(core)
    return out


def cast_clips(graph, slot_num):
    pre = f"spell{slot_num}"
    names = [n for n in graph.clips if n.lower().startswith(pre) and not (n.lower()[len(pre):len(pre) + 1] or "").isdigit()]
    keep = [n for n in names if not SKIP.search(n.lower()[len(pre):])]
    letters = sorted(n for n in keep if re.fullmatch(rf"{pre}[a-z]", n.lower()))
    if len(letters) >= 2:           # Spell1A, Spell1B, Spell1C: one per cast
        return [r for n in letters if (r := graph.resolve(n))]
    def first(rx, exclude=()):
        cands = sorted((n for n in keep if rx(n.lower()[len(pre):]) and n not in exclude), key=lambda n: (len(n), n))
        return cands[0] if cands else None
    main = first(lambda s: s == "") or first(lambda s: s in ("_cast", "_dash", "_air", "a", "_a")) \
        or first(lambda s: not (PRE.search(s) or LOOP.search(s) or POST.search(s)))
    parts = [first(lambda s: bool(PRE.search(s))), main, first(lambda s: bool(LOOP.search(s))),
             first(lambda s: bool(POST.search(s)), exclude=(main,))]
    seq = []
    for p in parts:
        for a in graph.resolve(p) if p else []:
            if a not in seq:
                seq.append(a)
    return [seq] if seq else []


def moves(champ_bin, champ):
    """{slot: "dash" | "blink" | None} from the tags of each slot's spells."""
    rec = next((v for v in champ_bin.values() if v.get("__type") == "CharacterRecord"), {})
    out = {}
    for slot, full in zip(SLOTS, (rec.get("spellNames") or [])[:4]):
        ability_name, _, spell_name = full.rpartition("/")
        ability = champ_bin.get(f"Characters/{champ}/Spells/{ability_name}") or {}
        paths = [p for p in ability.get("mChildSpells", []) if isinstance(p, str)]
        spells = [champ_bin.get(p) or {} for p in paths] or [champ_bin.get(f"Characters/{champ}/Spells/{spell_name}") or {}]
        main = champ_bin.get(f"Characters/{champ}/Spells/{spell_name}") or (spells[0] if spells else {})
        tags_of = lambda sp: set((sp.get("mSpell") or {}).get("mSpellTags") or [])
        # Spell passives (Lillia's stacks) aren't casts.
        subs = [sp for p, sp in zip(paths, spells) if "passive" not in p.lower()]
        out[slot] = None
        for group in ([main], subs):
            tags = set().union(*map(tags_of, group)) if group else set()
            # A recast that only swaps back to a shadow (Zed W2) isn't the cast itself.
            if group is subs and not any({"PositiveEffect_Teleport", "Trait_Strike"} <= tags_of(sp) for sp in subs):
                tags.discard("PositiveEffect_Teleport")
            if "PositiveEffect_Teleport" in tags:
                out[slot] = "blink"
            elif "PositiveEffect_MoveBlock" in tags:
                out[slot] = "dash"
            if out[slot]:
                break
    return out


def champion(root, champ):
    wads = ChampionWads(root, champ)
    low = champ.lower()
    graph_bin = wads.read(f"data/characters/{low}/animations/skin0.bin")
    main_bin = wads.read(f"data/characters/{low}/{low}.bin")
    if not graph_bin or not main_bin:
        return None
    g = next((v for v in entries(graph_bin).values() if v.get("__type") == "AnimationGraphData"), {})
    graph = Graph(g.get("mClipDataMap") or {})
    mv = moves(entries(main_bin), champ)
    death = next((graph.resolve(n) for n in ("Death", "death") if n in graph.clips), [])
    out = {"idle": idle(graph), "death": death}
    for k, slot in enumerate(SLOTS, 1):
        out[slot] = {"casts": cast_clips(graph, k), "move": mv.get(slot)}
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--index", default="viewer/replay-data/index.json")
    ap.add_argument("--out", default="viewer/replay-data/anims.json")
    ap.add_argument("--root", default=next((r for r in DEFAULT_ROOTS if os.path.isdir(r)), None))
    ap.add_argument("--only", help="comma-separated champion ids")
    ap.add_argument("--jobs", type=int, default=os.cpu_count())
    args = ap.parse_args()
    if not args.root:
        sys.exit("No League install found; pass --root")
    index = json.load(open(args.index))
    only = {s.lower() for s in args.only.split(",")} if args.only else None
    champs = [c["id"] for c in index["champions"] if not only or c["id"].lower() in only]
    data = json.load(open(args.out)) if only and os.path.exists(args.out) else {}
    with cf.ProcessPoolExecutor(args.jobs) as ex:
        for cid, d in zip(champs, ex.map(champion, [args.root] * len(champs), champs)):
            if d:
                data[cid] = d
    json.dump(dict(sorted(data.items())), open(args.out, "w"), separators=(",", ":"))
    no_cast = [f"{c} {s}" for c in champs if c in data for s in SLOTS if not data[c][s]["casts"]]
    moving = {m: sum(1 for c in champs if c in data for s in SLOTS if data[c][s]["move"] == m) for m in ("dash", "blink")}
    print(f"{len(data)} champions; {moving['dash']} dashes, {moving['blink']} blinks"
          + (f"; no cast clips for: {', '.join(no_cast)}" if no_cast else ""))


if __name__ == "__main__":
    main()
