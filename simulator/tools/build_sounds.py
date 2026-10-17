#!/usr/bin/env python3
"""Finds each ability's sound in Riot's official ability preview videos.

The preview videos (see build_replay_assets.py) carry the ability's sound effects and
voice line. The first burst of sound after the opening quiet is the cast, so this
records where that burst starts and how long it lasts as `sound: {slot: [start, length]}`
on each champion in INDEX (index.json). The viewer then plays that stretch of the video's
audio straight from Riot's CDN whenever the ability is cast.

With --out it also cuts every burst out and joins them into one OUT/sounds.mp3, with
OUT/sounds.json giving each one's place in it, for sandboxed pages that can't load
outside media (one file because those pages limit how many files they hold). Those files are Riot Games audio:
don't commit them.

Usage:
  python3 tools/build_sounds.py --index viewer/replay-data/index.json [--out DIR] [--only Ahri,Zed]
"""
import argparse
import array
import concurrent.futures as cf
import json
import math
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_replay_assets import SLOTS, clip_url, fetch, has_audio  # noqa: E402

WINDOW = 0.05         # seconds per loudness step
GAP = 0.3             # this long below the threshold ends the burst
MIN_LEN, MAX_LEN = 0.5, 3.0


def burst(path):
    """[start, length] of the first sound in the file, or None if it is silent.

    The clips have a quiet room tone (about -55 dB), so a step counts as sound when it is
    15 dB over the clip's quietest fifth, and at least -45 dB."""
    rate = 8000
    pcm = subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-vn", "-ac", "1", "-ar", str(rate),
                          "-f", "s16le", "-"], capture_output=True, check=True).stdout
    a, n = array.array("h", pcm), int(rate * WINDOW)
    db = [20 * math.log10(max(1.0, math.sqrt(sum(x * x for x in a[i:i + n]) / n)) / 32768)
          for i in range(0, len(a) - n + 1, n)]
    if not db:
        return None
    floor = sorted(db)[len(db) // 5]
    loud = [d > max(-45.0, floor + 15) for d in db]
    if True not in loud:
        return None
    first = loud.index(True)
    gap, last, quiet = round(GAP / WINDOW), first, 0
    for i in range(first, len(loud)):
        if loud[i]:
            last, quiet = i, 0
        else:
            quiet += 1
            if quiet >= gap:
                break
    start = max(0.0, first * WINDOW - 0.05)
    length = min(MAX_LEN, max(MIN_LEN, (last + 1) * WINDOW + 0.1 - start))
    return [round(start, 2), round(length, 2)]


def pack(index, cache, out, rate=32000, gap=0.25):
    """Joins every champion's sounds into OUT/sounds.mp3 and records where each sits.

    Each sound is decoded straight from its preview video to raw samples, so the offsets are
    exact sample counts, with a short silence between sounds; the whole file is encoded once
    (joining separately encoded MP3s drifts by a few milliseconds per file, which added up to
    seconds and played neighbouring sounds)."""
    clips, pcm = {}, bytearray()
    silence = bytes(int(rate * gap) * 2)
    for c in index["champions"]:
        for slot in SLOTS:
            seg = c.get("sound", {}).get(slot)
            raw = cache / "clips-raw" / f"{c['key']:04d}_{slot}.webm"
            if not seg or not raw.exists():
                continue
            fade = max(0.0, seg[1] - 0.12)
            data = subprocess.run(["ffmpeg", "-v", "error", "-ss", str(seg[0]), "-t", str(seg[1]), "-i", str(raw), "-vn",
                                   "-ac", "1", "-ar", str(rate), "-af", f"afade=t=out:st={fade:.2f}:d=0.12",
                                   "-f", "s16le", "-"], capture_output=True, check=True).stdout
            clips.setdefault(c["id"], {})[slot] = [round(len(pcm) / 2 / rate, 4), round(len(data) / 2 / rate, 4)]
            pcm += data + silence
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "s16le", "-ar", str(rate), "-ac", "1", "-i", "-",
                    "-c:a", "libmp3lame", "-b:a", "64k", str(out / "sounds.mp3")], input=bytes(pcm), check=True)
    json.dump({"file": "sounds.mp3", "clips": clips}, open(out / "sounds.json", "w"), separators=(",", ":"))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--index", default="viewer/replay-data/index.json")
    ap.add_argument("--cache", default=str(Path.home() / ".cache/deeparam-sim"))
    ap.add_argument("--out", help="also write sounds.mp3 and sounds.json here")
    ap.add_argument("--only", help="comma-separated champion ids")
    ap.add_argument("--jobs", type=int, default=8)
    args = ap.parse_args()

    index = json.load(open(args.index))
    cache = Path(args.cache)
    only = {s.lower() for s in args.only.split(",")} if args.only else None
    out = Path(args.out) if args.out else None
    if out:
        out.mkdir(parents=True, exist_ok=True)

    def job(champ, slot):
        raw = fetch(clip_url(champ["key"], slot), cache / "clips-raw" / f"{champ['key']:04d}_{slot}.webm")
        if raw is None or not has_audio(raw):
            return champ["id"], slot, None
        seg = burst(raw)
        return champ["id"], slot, seg

    champs = [c for c in index["champions"] if not only or c["id"].lower() in only]
    by_id = {c["id"]: c for c in champs}
    with cf.ThreadPoolExecutor(args.jobs) as ex:
        futures = [ex.submit(job, c, s) for c in champs for s in SLOTS]
        for n, f in enumerate(cf.as_completed(futures), 1):
            cid, slot, seg = f.result()
            c = by_id[cid]
            c.setdefault("sound", {})
            if seg:
                c["sound"][slot] = seg
            else:
                c["sound"].pop(slot, None)
            print(f"\rsounds {n}/{len(futures)}", end="", file=sys.stderr, flush=True)
    print(file=sys.stderr)

    json.dump(index, open(args.index, "w"), separators=(",", ":"))
    if out:
        pack(index, cache, out)
    missing = [f"{c['id']} {s}" for c in champs for s in SLOTS if s not in c.get("sound", {})]
    print(f"{len(champs)} champions, {len(champs) * 4 - len(missing)} sounds"
          + (f"; none for: {', '.join(missing)}" if missing else ""))


if __name__ == "__main__":
    main()
