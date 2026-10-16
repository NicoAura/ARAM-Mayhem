"""Extract the files the Mayhem datamine compares from locally installed League clients.

Same output layout as fetch.py (OUT_DIR/pbe and OUT_DIR/latest), but read straight
from the WAD archives of the PBE and live clients instead of CommunityDragon.

Usage: python3 local.py OUT_DIR [--pbe PBE_ROOT] [--live LIVE_ROOT]
A root is the folder holding Game/ and Plugins/ (on macOS, ".../League of Legends.app/Contents/LoL").
Requires: pip install cdtb zstandard xxhash, then `cdtb fetch-hashes` once for the name lists.
"""
import argparse, glob, io, json, os, struct, sys
from concurrent.futures import ProcessPoolExecutor

from cdtb.wad import Wad
from cdtb.binfile import BinReader
from cdtb.rstfile import RstFile, get_hashfile as rst_hashfile, key_to_hash as rst_key_to_hash
from cdtb.tools import json_dumps
from xxhash import xxh64_intdigest

MAC = "/Applications/League of Legends{}.app/Contents/LoL"
WIN = "C:/Riot Games/League of Legends{}"
DEFAULT_ROOTS = {"pbe": " (PBE)", "latest": ""}

GAME_DATA = "plugins/rcp-be-lol-game-data/global/default/v1"
CLIENT_JSON = ("augment-lists", "cherry-augments", "kiwi-hub", "items", "perks",
               "game-mode-mutators", "queues", "champion-summary")
# (wad relative to Game/DATA/FINAL, path inside the wad, output name)
GAME_BINS = [
    ("Maps/Shipping/Map12.wad.client", "maps/modespecificdata/kiwi.bin", "kiwi.bin.json"),
    ("Maps/Shipping/Map12.wad.client", "maps/modespecificdata/aram.bin", "aram.bin.json"),
    ("Maps/Shipping/Map12.wad.client", "data/maps/shipping/map12/map12.bin", "map12.bin.json"),
    ("Global.wad.client", "items", "items.cdtb.bin.json"),
]
STRINGTABLE = ("Localized/Global.en_US.wad.client", "data/menu/en_us/lol.stringtable", "lol.stringtable.json")


def default_root(channel):
    for base in (MAC, WIN):
        root = base.format(DEFAULT_ROOTS[channel])
        if os.path.isdir(os.path.join(root, "Game")):
            return root
    return None


def path_hash(path):
    return xxh64_intdigest(path.lower().encode())


def read_files(wad_path, paths):
    """Return {path: bytes} for the given paths inside one WAD (looked up by path hash)."""
    by_hash = {f.path_hash: f for f in Wad(wad_path).files}
    missing = [p for p in paths if path_hash(p) not in by_hash]
    if missing:
        raise FileNotFoundError(f"{wad_path}: missing {missing}")
    with open(wad_path, "rb") as f:
        return {p: by_hash[path_hash(p)].read_data(f) for p in paths}


def bin_to_json(data):
    """Serialize a .bin like CommunityDragon's .bin.json.

    Entries are length-prefixed, so one using a bin type cdtb can't read yet
    (seen on some material definitions) is skipped instead of failing the file.
    """
    f = io.BytesIO(data)
    magic = f.read(4)
    if magic == b"PTCH":
        f.read(8)
        magic = f.read(4)
    if magic != b"PROP":
        raise ValueError("not a bin file")
    reader = BinReader(f)
    _, linked, types = reader.read_binfile_header()
    out, skipped = {}, 0
    for htype in types:
        start = f.tell()
        length, = struct.unpack("<L", f.read(4))
        f.seek(start)
        try:
            entry = reader.read_binfile_entry(htype)
        except Exception:
            skipped += 1
            f.seek(start + 4 + length)
            continue
        out[entry.path.to_serializable()] = entry.to_serializable()
    if linked is not None:
        out["__linked"] = linked
    return json_dumps(out), skipped


def rst_to_json(data):
    rst = RstFile(io.BytesIO(data))
    names = {rst_key_to_hash(h, bits=rst.hash_bits): s for h, s in rst_hashfile().load().items()}
    entries = {names.get(k, f"{{{k:010x}}}"): v for k, v in rst.entries.items()}
    return json.dumps({"entries": entries, "version": rst.version}, ensure_ascii=False)


def write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)


def extract_champion(args):
    wad_path, alias, dest = args
    path = f"data/characters/{alias}/{alias}.bin"
    try:
        text, _ = bin_to_json(read_files(wad_path, [path])[path])
    except FileNotFoundError:
        return alias, False
    write(dest, text)
    return alias, True


def extract(root, out):
    final = os.path.join(root, "Game", "DATA", "FINAL")

    plugin_wads = glob.glob(os.path.join(root, "Plugins", "rcp-be-lol-game-data", "*.wad"))
    wanted = {f"{GAME_DATA}/{n}.json" for n in CLIENT_JSON}
    for wad_path in plugin_wads:
        hashes = {f.path_hash for f in Wad(wad_path).files}
        here = [p for p in wanted if path_hash(p) in hashes]
        for path, data in (read_files(wad_path, here) if here else {}).items():
            write(os.path.join(out, os.path.basename(path)), data.decode("utf-8"))
            wanted.discard(path)
    if wanted:
        print("  missing client files:", sorted(os.path.basename(p) for p in wanted))

    by_wad = {}
    for wad, path, name in GAME_BINS:
        by_wad.setdefault(wad, []).append((path, name))
    for wad, items in by_wad.items():
        data = read_files(os.path.join(final, wad), [p for p, _ in items])
        for path, name in items:
            text, skipped = bin_to_json(data[path])
            write(os.path.join(out, name), text)
            if skipped:
                print(f"  {name}: skipped {skipped} unreadable entries")

    wad, path, name = STRINGTABLE
    write(os.path.join(out, name), rst_to_json(read_files(os.path.join(final, wad), [path])[path]))

    # Name.wad.client only; Name.en_US.wad.client holds localized assets
    champ_wads = {os.path.basename(p)[:-len(".wad.client")].lower(): p
                  for p in glob.glob(os.path.join(final, "Champions", "*.wad.client"))
                  if "." not in os.path.basename(p)[:-len(".wad.client")]}
    champ_wads["wukong"] = champ_wads.get("monkeyking")
    aliases = [c["alias"].lower() for c in json.load(open(os.path.join(out, "champion-summary.json"))) if c["id"] > 0]
    # jade_<name> champions are stored in the base champion's WAD
    wad_for = {a: champ_wads.get(a.removeprefix("jade_")) for a in aliases}
    jobs = [(wad_for[a], a, os.path.join(out, "ch", f"{a}.json")) for a in aliases if wad_for[a]]
    with ProcessPoolExecutor() as ex:
        missing = [a for a, ok in ex.map(extract_champion, jobs) if not ok]
    missing += [a for a in aliases if not wad_for[a]]
    if missing:
        print("  missing champions:", missing)

    with open(os.path.join(root, "Game", "content-metadata.json")) as f:
        return json.load(f)["version"]


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("out")
    ap.add_argument("--pbe", default=default_root("pbe"))
    ap.add_argument("--live", default=default_root("latest"))
    args = ap.parse_args()
    for channel, root in (("pbe", args.pbe), ("latest", args.live)):
        if not root:
            sys.exit(f"No {channel} client found; pass --{'live' if channel == 'latest' else 'pbe'} ROOT")
        print(channel, extract(root, os.path.join(args.out, channel)))


if __name__ == "__main__":
    main()
