"""Get the PBE and live files for the Mayhem datamine: local clients first, CommunityDragon as backup.

Usage: python3 get.py OUT_DIR [--pbe PBE_ROOT] [--live LIVE_ROOT] [--remote]
Tries local.py (the installed PBE and live clients). Falls back to fetch.py when a client
is missing, cdtb isn't installed, reading fails, or the local PBE build is older than
CommunityDragon's (the client hasn't updated yet). --remote skips the local attempt.
Writes OUT_DIR/source.json with the source used and why. Output layout is the same either way.
"""
import argparse, json, os, shutil, subprocess, sys, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from fetch import HEADERS  # noqa: E402


# Same install locations as local.py (which can't be imported without cdtb).
ROOTS = {"pbe": " (PBE)", "latest": ""}
BASES = ("/Applications/League of Legends{}.app/Contents/LoL", "C:/Riot Games/League of Legends{}")


def default_root(channel):
    for base in BASES:
        root = base.format(ROOTS[channel])
        if os.path.isdir(os.path.join(root, "Game")):
            return root
    return None


def build_of(version):
    """'16.21.8289811+branch...' -> (16, 21, 8289811)."""
    return tuple(int(x) for x in version.split("+")[0].split(".") if x.isdigit())


def local_build(root):
    with open(os.path.join(root, "Game", "content-metadata.json")) as f:
        return json.load(f)["version"]


def remote_build(channel):
    url = f"https://raw.communitydragon.org/{channel}/content-metadata.json"
    with urllib.request.urlopen(urllib.request.Request(url, headers=HEADERS), timeout=60) as r:
        return json.load(r)["version"]


def try_local(out, pbe, live):
    """Return None on success, or the reason the local route can't be used."""
    if not pbe or not live:
        return "a local client (PBE or live) isn't installed"
    try:
        import cdtb  # noqa: F401
    except ImportError:
        return "cdtb isn't installed (pip install cdtb zstandard xxhash)"
    try:
        lp, rp = local_build(pbe), remote_build("pbe")
        if build_of(lp) < build_of(rp):
            return f"local PBE {lp} is older than CommunityDragon's {rp}"
    except Exception as e:  # can't compare: trust the local client
        print("build check skipped:", e)
    cmd = [sys.executable, os.path.join(HERE, "local.py"), out, "--pbe", pbe, "--live", live]
    if subprocess.run(cmd).returncode != 0:
        return "reading the local client files failed"
    return None


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("out")
    ap.add_argument("--pbe", default=default_root("pbe"))
    ap.add_argument("--live", default=default_root("latest"))
    ap.add_argument("--remote", action="store_true", help="skip the local clients")
    a = ap.parse_args()

    reason = "--remote" if a.remote else try_local(a.out, a.pbe, a.live)
    if reason is None:
        source = {"source": "local", "pbe": local_build(a.pbe), "live": local_build(a.live)}
    else:
        print(f"Using CommunityDragon: {reason}")
        for ch in ("pbe", "latest"):  # drop any half-written local output
            shutil.rmtree(os.path.join(a.out, ch), ignore_errors=True)
        subprocess.run([sys.executable, os.path.join(HERE, "fetch.py"), a.out], check=True)
        source = {"source": "communitydragon", "reason": reason,
                  "pbe": remote_build("pbe"), "live": remote_build("latest")}
    os.makedirs(a.out, exist_ok=True)
    with open(os.path.join(a.out, "source.json"), "w") as f:
        json.dump(source, f, indent=2)
    print(json.dumps(source))


if __name__ == "__main__":
    main()
