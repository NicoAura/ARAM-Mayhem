#!/usr/bin/env python3
"""Import ARAM Mayhem match history from the League client on macOS.

The approach follows mayhem-tracker (https://github.com/Yhprum/mayhem-tracker,
MIT, by Ryan Murphy): the client's own match list (LCU) only ever returns the
last 20 games, so match ids come from Riot's match-history service (SGP), the
same one the client uses, filtered to the Mayhem queues. Each id is then
fetched in full through the local client.

Riot only serves an account's last 1000 matches across all queues, so that is
as far back as any run can reach. Older games survive only in an archive you
already have: this script merges into it and never removes games, so running
it regularly keeps a complete history.

Needs only macOS's built-in python3 and curl. League must be running and
signed in. Usage:

    python3 mayhem_import.py -o ~/Downloads/mayhem-backup.json
"""

import argparse
import atexit
import base64
import collections
import datetime
import json
import os
import re
import subprocess
import sys
import tempfile
import time

MAYHEM_QUEUE_IDS = (2400, 2450)

LOCKFILE_CANDIDATES = [
    "/Applications/League of Legends.app/Contents/LoL/lockfile",
    os.path.expanduser("~/Applications/League of Legends.app/Contents/LoL/lockfile"),
]

SGP_HOSTS = [
    "https://usw2-red.pp.sgp.pvp.net",
    "https://euc1-red.pp.sgp.pvp.net",
    "https://apne1-red.pp.sgp.pvp.net",
    "https://apse1-red.pp.sgp.pvp.net",
]
SGP_HOST_BY_REGION = {
    **dict.fromkeys(["NA", "BR", "LAN", "LAS", "LA1", "LA2"], SGP_HOSTS[0]),
    **dict.fromkeys(["EUW", "EUNE", "EUN", "TR", "RU", "ME"], SGP_HOSTS[1]),
    **dict.fromkeys(["KR", "JP"], SGP_HOSTS[2]),
    **dict.fromkeys(["OCE", "OC1", "PH", "SG", "TH", "TW", "VN"], SGP_HOSTS[3]),
}
# The service clamps count to 200, so asking for more just gets 200
SGP_PAGE_SIZE = 200
SGP_HISTORY_CAP = 1000
# Safety bound; paging normally ends on a short page well before this
SGP_MAX_PAGES = 25
SGP_MAYHEM_TAGS = "&".join(f"tag=q_{q}" for q in MAYHEM_QUEUE_IDS) + "&tagsQueryType=OR"
SGP_ALL_TAGS = "tagsQueryType=AND"

# Riot's root for the certificate the client serves on localhost (valid to 2043)
RIOT_ROOT_CA = """-----BEGIN CERTIFICATE-----
MIIEIDCCAwgCCQDJC+QAdVx4UDANBgkqhkiG9w0BAQUFADCB0TELMAkGA1UEBhMC
VVMxEzARBgNVBAgTCkNhbGlmb3JuaWExFTATBgNVBAcTDFNhbnRhIE1vbmljYTET
MBEGA1UEChMKUmlvdCBHYW1lczEdMBsGA1UECxMUTG9MIEdhbWUgRW5naW5lZXJp
bmcxMzAxBgNVBAMTKkxvTCBHYW1lIEVuZ2luZWVyaW5nIENlcnRpZmljYXRlIEF1
dGhvcml0eTEtMCsGCSqGSIb3DQEJARYeZ2FtZXRlY2hub2xvZ2llc0ByaW90Z2Ft
ZXMuY29tMB4XDTEzMTIwNDAwNDgzOVoXDTQzMTEyNzAwNDgzOVowgdExCzAJBgNV
BAYTAlVTMRMwEQYDVQQIEwpDYWxpZm9ybmlhMRUwEwYDVQQHEwxTYW50YSBNb25p
Y2ExEzARBgNVBAoTClJpb3QgR2FtZXMxHTAbBgNVBAsTFExvTCBHYW1lIEVuZ2lu
ZWVyaW5nMTMwMQYDVQQDEypMb0wgR2FtZSBFbmdpbmVlcmluZyBDZXJ0aWZpY2F0
ZSBBdXRob3JpdHkxLTArBgkqhkiG9w0BCQEWHmdhbWV0ZWNobm9sb2dpZXNAcmlv
dGdhbWVzLmNvbTCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBAKoJemF/
6PNG3GRJGbjzImTdOo1OJRDI7noRwJgDqkaJFkwv0X8aPUGbZSUzUO23cQcCgpYj
21ygzKu5dtCN2EcQVVpNtyPuM2V4eEGr1woodzALtufL3Nlyh6g5jKKuDIfeUBHv
JNyQf2h3Uha16lnrXmz9o9wsX/jf+jUAljBJqsMeACOpXfuZy+YKUCxSPOZaYTLC
y+0GQfiT431pJHBQlrXAUwzOmaJPQ7M6mLfsnpHibSkxUfMfHROaYCZ/sbWKl3lr
ZA9DbwaKKfS1Iw0ucAeDudyuqb4JntGU/W0aboKA0c3YB02mxAM4oDnqseuKV/CX
8SQAiaXnYotuNXMCAwEAATANBgkqhkiG9w0BAQUFAAOCAQEAf3KPmddqEqqC8iLs
lcd0euC4F5+USp9YsrZ3WuOzHqVxTtX3hR1scdlDXNvrsebQZUqwGdZGMS16ln3k
WObw7BbhU89tDNCN7Lt/IjT4MGRYRE+TmRc5EeIXxHkQ78bQqbmAI3GsW+7kJsoO
q3DdeE+M+BUJrhWorsAQCgUyZO166SAtKXKLIcxa+ddC49NvMQPJyzm3V+2b1roP
SvD2WV8gRYUnGmy/N0+u6ANq5EsbhZ548zZc+BI4upsWChTLyxt2RxR7+uGlS1+5
EcGfKZ+g024k/J32XP4hdho7WYAS2xMiV83CfLR/MNi8oSMaVQTdKD8cpgiWJk3L
XWehWA==
-----END CERTIFICATE-----
"""


class HttpError(Exception):
    def __init__(self, status, url):
        super().__init__(f"HTTP {status} from {url}")
        self.status = status


def log(msg):
    print(msg, file=sys.stderr, flush=True)


# ---------- HTTP via curl ----------
# curl uses the macOS keychain for Riot's public hosts, which python.org builds
# of Python don't. Secrets go in through stdin, never on the command line where
# other processes could see them.

def curl_json(url, *, auth_header, cacert=None, timeout=30):
    config = f'url = "{url}"\nheader = "Authorization: {auth_header}"\n'
    cmd = ["curl", "-sS", "--max-time", str(timeout), "-w", "\n%{http_code}", "-K", "-"]
    if cacert:
        cmd += ["--cacert", cacert]
    res = subprocess.run(cmd, input=config, capture_output=True, text=True)
    if res.returncode != 0:
        raise ConnectionError(f"{url}: {res.stderr.strip() or 'curl exit ' + str(res.returncode)}")
    body, _, status = res.stdout.rpartition("\n")
    status = int(status or 0)
    if status < 200 or status >= 300:
        raise HttpError(status, url)
    return json.loads(body) if body.strip() else None


class Lcu:
    """The League client's local API, read-only, on 127.0.0.1."""

    def __init__(self, port, password):
        self.base = f"https://127.0.0.1:{port}"
        token = base64.b64encode(f"riot:{password}".encode()).decode()
        self.auth = f"Basic {token}"
        ca = os.environ.get("MAYHEM_LCU_CA")  # tests point this at their own CA
        if not ca:
            fd, ca = tempfile.mkstemp(suffix=".pem")
            with os.fdopen(fd, "w") as f:
                f.write(RIOT_ROOT_CA)
            atexit.register(os.unlink, ca)
        self.cacert = ca

    def get(self, path):
        return curl_json(self.base + path, auth_header=self.auth, cacert=self.cacert)


def find_client(lockfile=None):
    paths = [lockfile] if lockfile else LOCKFILE_CANDIDATES
    for p in paths:
        try:
            text = open(p).read().strip()
        except OSError:
            continue
        # "LeagueClient:<pid>:<port>:<password>:<protocol>"
        m = re.match(r"^[^:]+:(\d+):(\d+):(.+):https?$", text)
        if m:
            return Lcu(m.group(2), m.group(3))
    if lockfile:
        sys.exit(f"Couldn't read a League lockfile at {lockfile}.")
    # Fall back to the running client's command line, for installs elsewhere
    out = subprocess.run(["ps", "-A", "-o", "args="], capture_output=True, text=True).stdout
    for line in out.splitlines():
        if "LeagueClientUx" not in line:
            continue
        port = re.search(r"--app-port=(\d+)", line)
        pw = re.search(r"--remoting-auth-token=([\w-]+)", line)
        if port and pw:
            return Lcu(port.group(1), pw.group(1))
    sys.exit("League isn't running. Start it, sign in, and run this again.")


# ---------- Riot match-history service (SGP) ----------

def sgp_token(lcu):
    # The RSO access token is what the service accepts now; the league-session
    # token is the older fallback
    try:
        rso = lcu.get("/lol-rso-auth/v1/authorization/access-token")
        token = rso if isinstance(rso, str) else (rso or {}).get("token")
        if token:
            return token
    except (HttpError, ConnectionError):
        pass
    token = lcu.get("/lol-league-session/v1/league-session-token")
    if not isinstance(token, str) or not token:
        sys.exit("The League client hasn't finished signing in. Try again in a moment.")
    return token


def sgp_url(host, puuid, start, count, tags=SGP_ALL_TAGS):
    return (f"{host}/match-history-query/v1/products/lol/player/{puuid}"
            f"?startIndex={start}&count={count}&{tags}")


def sgp_get(host, puuid, token, start, count, tags=SGP_ALL_TAGS, timeout=30):
    return curl_json(sgp_url(host, puuid, start, count, tags),
                     auth_header=f"Bearer {token}", timeout=timeout)


def find_sgp_host(lcu, puuid, token, override=None):
    if override:
        return override
    guess = None
    try:
        region = (lcu.get("/riotclient/region-locale") or {}).get("region", "")
        guess = SGP_HOST_BY_REGION.get(str(region).upper())
    except (HttpError, ConnectionError):
        pass
    # Sharded by geography, not game region, so the guess is only a first try
    for host in ([guess] if guess else []) + [h for h in SGP_HOSTS if h != guess]:
        try:
            sgp_get(host, puuid, token, 0, 1, timeout=8)
            return host
        except (HttpError, ConnectionError):
            continue
    sys.exit("Couldn't reach Riot's match history service for your region.")


def walk_ids(host, puuid, token, tags, known, full):
    """Match ids newest first. Unless full, stops at the first page we already have."""
    ids = []
    for page in range(SGP_MAX_PAGES):
        body = sgp_get(host, puuid, token, page * SGP_PAGE_SIZE, SGP_PAGE_SIZE, tags)
        if not isinstance(body, list) or not body:
            return ids, "exhausted"
        # Ids arrive platform-prefixed, e.g. "NA1_5616465966"
        page_ids = []
        for raw in body:
            try:
                page_ids.append(int(str(raw).split("_")[-1]))
            except ValueError:
                pass
        ids += page_ids
        if len(body) < SGP_PAGE_SIZE:
            return ids, "exhausted"
        if not full and known and all(i in known for i in page_ids):
            return ids, "known"
    return ids, "page-limit"


def history_window_full(host, puuid, token):
    # History right up to the cap and nothing past it means Riot cut it off
    try:
        inside = sgp_get(host, puuid, token, SGP_HISTORY_CAP - 10, SGP_PAGE_SIZE)
        if not inside:
            return False
        return sgp_get(host, puuid, token, SGP_HISTORY_CAP, SGP_PAGE_SIZE) == []
    except (HttpError, ConnectionError):
        return False


# ---------- archive file ----------

def game_puuids(game):
    for pi in game.get("participantIdentities") or []:
        p = (pi.get("player") or {}).get("puuid")
        if p:
            yield p


def load_archive(path):
    """Returns (container, games). container is whatever shape the file had."""
    if not os.path.exists(path):
        return None, []
    with open(path) as f:
        data = json.load(f)
    if isinstance(data, list):
        return data, data
    for key in ("games", "matches", "data"):
        if isinstance(data.get(key), list):
            return data, data[key]
    sys.exit(f"{path} isn't a match archive this script recognizes. Pick a different -o file.")


def archive_owner(container, games):
    if isinstance(container, dict) and container.get("puuid"):
        return container["puuid"]
    counts = collections.Counter(p for g in games for p in game_puuids(g))
    return counts.most_common(1)[0][0] if counts else None


def save_archive(path, container, games, summoner):
    games.sort(key=lambda g: g.get("gameCreation") or 0, reverse=True)
    if isinstance(container, list):
        out = games
    else:
        out = container if isinstance(container, dict) else {}
        key = next((k for k in ("games", "matches", "data") if isinstance(out.get(k), list)), "games")
        out.setdefault("puuid", summoner["puuid"])
        out.setdefault("gameName", summoner.get("gameName"))
        out.setdefault("tagLine", summoner.get("tagLine"))
        out["updatedAt"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
        out[key] = games
    # Write beside the target, then swap, so a failed save never eats the archive
    d = os.path.dirname(os.path.abspath(path))
    fd, tmp = tempfile.mkstemp(dir=d, prefix=".mayhem-", suffix=".json")
    try:
        with os.fdopen(fd, "w") as f:
            json.dump(out, f, indent=1)
        os.replace(tmp, path)
    except BaseException:
        os.unlink(tmp)
        raise


# ---------- main ----------

def main():
    ap = argparse.ArgumentParser(description="Import ARAM Mayhem games from the League client into a JSON archive.")
    ap.add_argument("-o", "--out", default=os.path.expanduser("~/Downloads/mayhem-backup.json"),
                    help="archive to create or merge into (default: ~/Downloads/mayhem-backup.json)")
    ap.add_argument("--full", action="store_true",
                    help="check every game Riot still serves, not just the new ones, to fill gaps")
    ap.add_argument("--lockfile", help="path to League's lockfile, if League isn't in /Applications")
    ap.add_argument("--sgp-host", help=argparse.SUPPRESS)  # for testing
    args = ap.parse_args()
    out = os.path.expanduser(args.out)

    container, games = load_archive(out)
    lcu = find_client(args.lockfile)
    try:
        summoner = lcu.get("/lol-summoner/v1/current-summoner")
    except (HttpError, ConnectionError) as e:
        sys.exit(f"Couldn't talk to the League client ({e}). Is it fully signed in?")
    puuid = summoner["puuid"]
    name = f"{summoner.get('gameName', '?')}#{summoner.get('tagLine', '?')}"

    owner = archive_owner(container, games)
    if owner and owner != puuid:
        sys.exit(f"{out} belongs to a different account than {name}. Use a different -o file.")

    known = {g.get("gameId") for g in games}
    log(f"Signed in as {name}. {len(known)} games already in {out}.")

    token = sgp_token(lcu)
    host = find_sgp_host(lcu, puuid, token, args.sgp_host)
    ids, stop = walk_ids(host, puuid, token, SGP_MAYHEM_TAGS, known, args.full)
    if not ids:
        # An empty filtered walk could mean Riot renamed the queue tags, so
        # check every game the slow way before believing there are none
        log("No Mayhem games by queue filter; checking all recent games instead.")
        ids, stop = walk_ids(host, puuid, token, SGP_ALL_TAGS, known, args.full)

    pending = [i for i in dict.fromkeys(ids) if i not in known]
    log(f"Riot lists {len(ids)} matching games; {len(pending)} are new.")

    added = failed = 0
    try:
        for n, game_id in enumerate(pending, 1):
            try:
                game = lcu.get(f"/lol-match-history/v1/games/{game_id}")
            except (HttpError, ConnectionError) as e:
                failed += 1
                log(f"  [{n}/{len(pending)}] game {game_id}: {e}; a later run will retry it")
                continue
            if game.get("queueId") in MAYHEM_QUEUE_IDS:
                games.append(game)
                known.add(game_id)
                added += 1
            if n % 25 == 0 or n == len(pending):
                log(f"  [{n}/{len(pending)}] {added} added")
            time.sleep(0.05)  # be gentle with the client
    except KeyboardInterrupt:
        log("Stopped. Saving what was fetched so far.")

    if added or container is None:
        save_archive(out, container, games, summoner)
    log(f"Done: {added} new Mayhem games added, {len(games)} in the archive.")
    if failed:
        log(f"{failed} games couldn't be fetched. Run again to retry them.")
    if stop == "page-limit":
        log(f"Stopped at the {SGP_MAX_PAGES}-page safety limit; older games weren't checked.")
    elif stop == "exhausted" and history_window_full(host, puuid, token):
        log(f"Riot only keeps your last {SGP_HISTORY_CAP} matches (all queues). Older games can't be "
            "fetched, but any already in the archive are kept.")


if __name__ == "__main__":
    main()
