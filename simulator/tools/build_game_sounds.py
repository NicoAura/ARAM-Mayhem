#!/usr/bin/env python3
"""Builds the replay's ability and death sounds from a local League of Legends install.

Each champion's Wwise sound banks name their events after the spell that plays them
(Play_sfx_Annie_AnnieQ_OnCast, Play_vo_Annie_Spell3DQCast, Play_vo_Annie_Death3D), so
every slot gets that ability's own sound effect, mixed with its voice line, instead of a
guess from Riot's preview video. Event names are FNV-1 hashes in the banks; the names are
recovered from the strings in the champion's game data.

Writes OUT/sounds.m4a (every sound joined, AAC) and OUT/sounds.json with each one's place
in it as clips[champion][slot] = [start, length], slots Q W E R and D (death). Those are
Riot Games audio: don't commit them.

Needs: pip install cdtb zstandard xxhash, `cdtb fetch-hashes` once, vgmstream-cli on PATH
(or --vgmstream) to decode Wwise audio, and macOS afconvert to encode (else a .wav is written).

Usage:
  python3 tools/build_game_sounds.py --index viewer/replay-data/index.json --out viewer/replay-data/sounds
      [--root "/Applications/League of Legends.app/Contents/LoL"] [--only Ahri,Zed] [--dry-run]
"""
import argparse
import array
import concurrent.futures as cf
import io
import json
import math
import os
import re
import shutil
import struct
import subprocess
import sys
import tempfile
import wave
from pathlib import Path

from cdtb.binfile import BinReader
from cdtb.wad import Wad
from xxhash import xxh64_intdigest

SLOTS = "QWER"
RATE = 44100
MAX_LEN = 3.5          # seconds kept from each sound
VO_GAIN, SFX_GAIN = 0.9, 1.0
DEFAULT_ROOTS = ["/Applications/League of Legends.app/Contents/LoL", "C:/Riot Games/League of Legends"]
# Event suffixes in the order they're preferred as "the" sound of a cast.
# Spells whose sound events don't carry the spell's name.
EVENT_ALIASES = {"ApheliosQ": "ApheliosCalibrumQ", "LuluE": "LuluFaerieShield", "MalzaharW": "MalzaharVoidling", "ZileanW": "Rewind"}
CAST_SUFFIXES = ["oncast", "cast", "cast3d", "onmissilelaunch", "onbuffactivate", "buffactivate", "onhit", "hit"]


# ---------- WAD and bin files ----------

class ChampionWads:
    def __init__(self, root, name):
        base = Path(root) / "Game" / "DATA" / "FINAL" / "Champions"
        self.paths = [p for p in (base / f"{name}.wad.client", base / f"{name}.en_US.wad.client") if p.exists()]
        self.files = {}
        for p in self.paths:
            for f in Wad(str(p)).files:
                self.files[f.path_hash] = (p, f)

    def read(self, path):
        hit = self.files.get(xxh64_intdigest(path.lower().encode()))
        if not hit:
            return None
        with open(hit[0], "rb") as fh:
            return hit[1].read_data(fh)

    def bins(self):
        for p in self.paths:
            with open(p, "rb") as fh:
                for f in Wad(str(p)).files:
                    try:
                        d = f.read_data(fh)
                    except Exception:
                        continue
                    if d[:4] in (b"PROP", b"PTCH"):
                        yield d


def spell_names(data):
    """Spell names for Q W E R from the champion's CharacterRecord (AhriQAbility/AhriQ -> AhriQ)."""
    f = io.BytesIO(data)
    if f.read(4) == b"PTCH":
        f.read(8); f.read(4)
    reader = BinReader(f)
    _, _, types = reader.read_binfile_header()
    for htype in types:
        start = f.tell()
        length, = struct.unpack("<L", f.read(4))
        f.seek(start)
        try:
            entry = reader.read_binfile_entry(htype)
        except Exception:
            f.seek(start + 4 + length)
            continue
        if str(entry.type) == "CharacterRecord":
            names = entry.to_serializable().get("spellNames") or []
            names = [n.split("/")[-1].removesuffix("_ClientTooltipWrapper") for n in names[:4]]
            return [EVENT_ALIASES.get(n, n) for n in names]
    return []


# ---------- Wwise banks ----------

def fnv1(s):
    h = 0x811C9DC5
    for b in s.lower().encode():
        h = ((h * 0x01000193) & 0xFFFFFFFF) ^ b
    return h


def sections(d):
    out, i = {}, 0
    while i + 8 <= len(d):
        n, = struct.unpack_from("<I", d, i + 4)
        out[d[i:i + 4].decode("latin-1")] = d[i + 8:i + 8 + n]
        i += 8 + n
    return out


def embedded_wems(d):
    s = sections(d)
    if "DIDX" not in s:
        return {}
    di = s["DIDX"]
    return {wid: s["DATA"][off:off + sz] for wid, off, sz in (struct.unpack_from("<III", di, k) for k in range(0, len(di), 12))}


def wpk_wems(d):
    if d[:4] != b"r3d2":
        return {}
    _, count = struct.unpack_from("<II", d, 4)
    out = {}
    for k in range(count):
        o, = struct.unpack_from("<I", d, 12 + 4 * k)
        if o:
            off, sz, nl = struct.unpack_from("<III", d, o)
            out[int(d[o + 12:o + 12 + nl * 2].decode("utf-16-le").split(".")[0])] = d[off:off + sz]
    return out


def _parent(b, off):
    """DirectParentID from a node's NodeBaseParams (bank version 145)."""
    nfx = b[off + 1]
    off += 2 + (1 + nfx * 7 if nfx else 0)
    off += 2 + b[off + 1] * 6     # bOverrideParentMetadata, uNumFxMetadata
    off += 1 + 4                  # bOverrideAttachmentParams, OverrideBusId
    return struct.unpack_from("<I", b, off)[0]


class Bank:
    """Events, play actions and the sound hierarchy of one events bank."""

    def __init__(self, data):
        h = sections(data).get("HIRC", b"\0\0\0\0")
        n, = struct.unpack_from("<I", h)
        self.objs, self.children, i = {}, {}, 4
        for _ in range(n):
            t, size, oid = struct.unpack_from("<BII", h, i)
            body = h[i + 9:i + 5 + size]
            i += 5 + size
            o = {"t": t}
            try:
                if t == 4:
                    o["actions"] = list(struct.unpack_from(f"<{body[0]}I", body, 1))
                elif t == 3:
                    o["atype"], o["target"] = struct.unpack_from("<HI", body)
                elif t == 2:
                    o["src"], = struct.unpack_from("<I", body, 5)
                    o["parent"] = _parent(body, 14)
                elif t in (5, 6, 7, 9):
                    o["parent"] = _parent(body, 0)
            except (struct.error, IndexError):
                pass
            self.objs[oid] = o
            if o.get("parent"):
                self.children.setdefault(o["parent"], []).append(oid)

    def events(self):
        return {oid for oid, o in self.objs.items() if o["t"] == 4}

    def layers(self, event, pick=0):
        """Wem ids heard together for one play of the event: the `pick`-th variation of each
        random or switch container, every child of a layer container."""
        out = []
        for a in self.objs.get(event, {}).get("actions", []):
            act = self.objs.get(a)
            if act and act.get("atype") == 0x0403:   # Play
                out += self._resolve(act["target"], pick, 0)
        return out

    def variations(self, event, most=4):
        out = []
        for k in range(most):
            v = self.layers(event, k)
            if v and v not in out:
                out.append(v)
        return out

    def _resolve(self, oid, pick, depth):
        o = self.objs.get(oid)
        if not o or depth > 12:
            return []
        if o["t"] == 2:
            return [o["src"]]
        kids = self.children.get(oid, [])
        if o["t"] == 9:
            return [w for k in kids for w in self._resolve(k, pick, depth + 1)]
        # random / sequence / switch / mixer: the pick-th child that sounds
        kids = kids[pick % len(kids):] + kids[:pick % len(kids)] if kids else kids
        for k in kids:
            got = self._resolve(k, pick, depth + 1)
            if got:
                return got
        return []


# ---------- choosing events ----------

def split_event(name):
    m = re.match(r"(?i)play_(sfx|vo)_([^_]+)_(.+)$", name)
    return (m.group(1).lower(), m.group(2), m.group(3)) if m else None


def pick(names, kind, champ, spell, slot):
    """Best event name of `kind` for one ability slot."""
    best = None
    for n in names:
        parts = split_event(n)
        if not parts or parts[0] != kind:
            continue
        _, owner, rest = parts
        if not owner.lower().startswith(champ.lower()):
            continue
        tok, _, suffix = rest.partition("_")
        tl, sl, spl = tok.lower(), suffix.lower(), spell.lower()
        if kind == "vo" and tl == f"spell3d{slot.lower()}cast":
            rank = 0
        elif tl == spl:
            rank = 1
        elif tl.startswith(spl) or tl.startswith(f"{champ}{slot}".lower()):
            rank = 2
        elif re.fullmatch(rf"{champ.lower()}[a-z]+{slot.lower()}", tl):   # ApheliosCalibrumQ
            rank = 3
        else:
            continue
        if any(w in sl for w in ("loop", "stop", "end", "death", "recall")):
            continue
        sfx_rank = next((k for k, s in enumerate(CAST_SUFFIXES) if sl == s or sl.startswith(s)), len(CAST_SUFFIXES))
        key = (rank, sfx_rank, len(n), n)
        if best is None or key < best[0]:
            best = (key, n)
    return best and best[1]


def pick_death(names, kind, champ):
    want = [f"play_{kind}_{champ}_death3d".lower(), f"play_{kind}_{champ}_death".lower()]
    by = {n.lower(): n for n in names}
    for w in want:
        if w in by:
            return by[w]
    return next((n for n in sorted(names) if n.lower().startswith(f"play_{kind}_{champ}_".lower())
                 and "death" in n.lower() and "buff" not in n.lower()), None)


def plan_champion(root, champ):
    """{slot: [wem bytes, ...]} for Q W E R D, plus the event names chosen."""
    wads = ChampionWads(root, champ)
    if not wads.paths:
        return None, {}
    low = champ.lower()
    base = f"assets/sounds/wwise2016/{{}}/characters/{low}/skins/base/{low}_base_{{}}"
    banks, media = {}, {}
    for kind, folder in (("sfx", "sfx"), ("vo", "vo/en_us")):
        ev = wads.read(base.format(folder, f"{kind}_events.bnk"))
        if ev:
            banks[kind] = Bank(ev)
        audio = wads.read(base.format(folder, f"{kind}_audio.bnk"))
        if audio:
            media.update(embedded_wems(audio))
        audio = wads.read(base.format(folder, f"{kind}_audio.wpk"))
        if audio:
            media.update(wpk_wems(audio))
    main_bin = wads.read(f"data/characters/{low}/{low}.bin")
    spells = spell_names(main_bin) if main_bin else []

    strings = set()
    for d in wads.bins():
        strings.update(m.decode() for m in re.findall(rb"Play_[A-Za-z0-9_]+", d))
    for slot, spell in zip(SLOTS, spells):
        strings |= {f"Play_vo_{champ}_Spell3D{slot}Cast", f"Play_vo_{champ}_{spell}_cast3D",
                    f"Play_sfx_{champ}_{spell}_OnCast"}
    strings |= {f"Play_{k}_{champ}_{d}" for k in ("sfx", "vo") for d in ("Death3D", "Death")}

    names = {}
    for kind, bank in banks.items():
        ids = bank.events()
        names[kind] = {n for n in strings if fnv1(n) in ids}

    chosen, plan = {}, {}
    for slot, spell in list(zip(SLOTS, spells)) + [("D", None)]:
        layers = []
        for kind in ("sfx", "vo"):
            if kind not in banks:
                continue
            n = pick_death(names[kind], kind, champ) if slot == "D" else pick(names[kind], kind, champ, spell, slot)
            if not n:
                continue
            options = [[media[w] for w in v if w in media] for v in banks[kind].variations(fnv1(n))]
            options = [o for o in options if o]
            if options:
                chosen.setdefault(slot, []).append(n)
                layers.append((kind, options))
        if layers:
            plan[slot] = layers
    return plan, chosen


# ---------- audio ----------

def decode(vgm, wem, tmp):
    src, dst = Path(tmp) / "in.wem", Path(tmp) / "out.wav"
    src.write_bytes(wem)
    subprocess.run([vgm, "-o", str(dst), str(src)], capture_output=True, check=True)
    with wave.open(str(dst)) as w:
        ch, rate, frames = w.getnchannels(), w.getframerate(), w.readframes(w.getnframes())
    a = array.array("h", frames)
    if ch > 1:
        a = array.array("h", (sum(a[i:i + ch]) // ch for i in range(0, len(a), ch)))
    if rate != RATE:
        step = rate / RATE
        a = array.array("h", (a[int(i * step)] for i in range(int(len(a) / step))))
    return a[:int(MAX_LEN * RATE)]


def loud(a):
    return len(a) > 0 and math.sqrt(sum(x * x for x in a[::8]) / len(a[::8])) > 200


def mix(tracks):
    n = max(len(t) for _, t in tracks)
    out = [0.0] * n
    for gain, t in tracks:
        for i, v in enumerate(t):
            out[i] += v * gain
    fade = min(n, int(0.08 * RATE))
    for k in range(fade):
        out[n - fade + k] *= 1 - k / fade
    return array.array("h", (max(-32768, min(32767, int(v))) for v in out))


def render_champion(vgm, plan):
    clips = {}
    with tempfile.TemporaryDirectory() as tmp:
        for slot, layers in plan.items():
            tracks = []
            for kind, options in layers:
                for wems in options:       # the first variation that isn't silent
                    try:
                        got = [decode(vgm, w, tmp) for w in wems]
                    except (subprocess.CalledProcessError, wave.Error, EOFError):
                        continue
                    if any(loud(t) for t in got):
                        tracks += [(VO_GAIN if kind == "vo" else SFX_GAIN, t) for t in got]
                        break
            if tracks:
                clips[slot] = mix(tracks)
    return clips


def write_pack(rendered, out):
    gap = array.array("h", [0] * int(0.3 * RATE))
    pcm, clips, at = array.array("h"), {}, 0
    for cid, slots in rendered.items():
        for slot, a in slots.items():
            clips.setdefault(cid, {})[slot] = [round(at / RATE, 3), round(len(a) / RATE, 3)]
            pcm += a + gap
            at += len(a) + len(gap)
    wav = out / "sounds.wav"
    with wave.open(str(wav), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(RATE); w.writeframes(pcm.tobytes())
    name = "sounds.wav"
    if shutil.which("afconvert"):
        subprocess.run(["afconvert", "-f", "m4af", "-d", "aac", "-b", "64000", str(wav), str(out / "sounds.m4a")], check=True)
        wav.unlink()
        name = "sounds.m4a"
    for old in ("sounds.mp3",):
        (out / old).unlink(missing_ok=True)
    json.dump({"file": name, "clips": clips}, open(out / "sounds.json", "w"), separators=(",", ":"))
    return name


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--index", default="viewer/replay-data/index.json")
    ap.add_argument("--out", default="viewer/replay-data/sounds")
    ap.add_argument("--root", default=next((r for r in DEFAULT_ROOTS if os.path.isdir(r)), None))
    ap.add_argument("--vgmstream", default=shutil.which("vgmstream-cli"))
    ap.add_argument("--only", help="comma-separated champion ids")
    ap.add_argument("--jobs", type=int, default=os.cpu_count())
    ap.add_argument("--dry-run", action="store_true", help="only print the events chosen")
    args = ap.parse_args()
    if not args.root:
        sys.exit("No League install found; pass --root")
    if not args.dry_run and not args.vgmstream:
        sys.exit("vgmstream-cli not found; install it or pass --vgmstream PATH")

    index = json.load(open(args.index))
    only = {s.lower() for s in args.only.split(",")} if args.only else None
    champs = [c["id"] for c in index["champions"] if not only or c["id"].lower() in only]

    def job(cid):
        plan, chosen = plan_champion(args.root, cid)
        if args.dry_run or not plan:
            return cid, chosen, {}
        return cid, chosen, render_champion(args.vgmstream, plan)

    rendered, report = {}, {}
    with cf.ThreadPoolExecutor(args.jobs) as ex:
        for n, (cid, chosen, clips) in enumerate(ex.map(job, champs), 1):
            report[cid] = chosen
            if clips:
                rendered[cid] = clips
            print(f"\rsounds {n}/{len(champs)}", end="", file=sys.stderr, flush=True)
    print(file=sys.stderr)

    for cid in champs:
        print(cid, json.dumps(report[cid]))
    missing = [f"{c} {s}" for c in champs for s in SLOTS + "D" if s not in report[c]]
    print(f"{len(champs)} champions, {len(champs) * 5 - len(missing)} sounds"
          + (f"; none for: {', '.join(missing)}" if missing else ""), file=sys.stderr)
    if not args.dry_run:
        out = Path(args.out)
        out.mkdir(parents=True, exist_ok=True)
        print("wrote", out / write_pack({c: rendered[c] for c in champs if c in rendered}, out), file=sys.stderr)


if __name__ == "__main__":
    main()
