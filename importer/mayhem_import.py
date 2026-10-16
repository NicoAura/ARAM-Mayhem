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


class ImportFailed(Exception):
    """A problem the person can fix (League closed, wrong archive...). The message says how."""


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
        raise ImportFailed(f"Couldn't read a League lockfile at {lockfile}.")
    # Fall back to the running client's command line, for installs elsewhere
    out = subprocess.run(["ps", "-A", "-o", "args="], capture_output=True, text=True).stdout
    for line in out.splitlines():
        if "LeagueClientUx" not in line:
            continue
        port = re.search(r"--app-port=(\d+)", line)
        pw = re.search(r"--remoting-auth-token=([\w-]+)", line)
        if port and pw:
            return Lcu(port.group(1), pw.group(1))
    raise ImportFailed("League isn't running. Start it, sign in, and run this again.")


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
        raise ImportFailed("The League client hasn't finished signing in. Try again in a moment.")
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
    raise ImportFailed("Couldn't reach match history for your region.")


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
    raise ImportFailed(f"{path} isn't a match archive this script recognizes. Pick a different -o file.")


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


# ---------- kill positions ----------
# The client keeps a timeline for each game; its CHAMPION_KILL events carry map
# positions, which the dashboard's kill map draws. Each game stores a compact
# list under "killMap": [seconds, x, y, killerId, victimId] per kill, with
# participant ids as in the game. None means the client had no timeline.

TIMELINES_PER_RUN = 200


def compact_kills(timeline):
    kills = []
    for frame in (timeline or {}).get("frames") or []:
        for ev in frame.get("events") or []:
            if str(ev.get("type", "")).upper() != "CHAMPION_KILL":
                continue
            pos = ev.get("position") or {}
            if pos.get("x") is None or pos.get("y") is None:
                continue
            kills.append([round((ev.get("timestamp") or 0) / 1000), pos["x"], pos["y"],
                          ev.get("killerId") or 0, ev.get("victimId") or 0])
    return kills


def fill_kill_maps(lcu, games, progress=log, limit=TIMELINES_PER_RUN):
    """Adds "killMap" to games that don't have one yet. Returns how many changed."""
    todo = [g for g in games if "killMap" not in g and g.get("gameId")][:limit]
    if not todo:
        return 0
    progress(f"Fetching kill positions for {len(todo)} games.")
    changed = 0
    for n, game in enumerate(todo, 1):
        try:
            timeline = lcu.get(f"/lol-match-history/v1/game-timelines/{game['gameId']}")
        except HttpError as e:
            if e.status == 404:
                game["killMap"] = None
                changed += 1
            continue
        except ConnectionError:
            continue  # a later run retries it
        game["killMap"] = compact_kills(timeline)
        changed += 1
        if n % 50 == 0 or n == len(todo):
            progress(f"  [{n}/{len(todo)}] kill positions")
        time.sleep(0.05)
    return changed


# ---------- import ----------

def run_import(out, full=False, lockfile=None, sgp_host=None, progress=log):
    """Merge new Mayhem games from the signed-in client into `out`. Returns a summary dict."""
    container, games = load_archive(out)
    lcu = find_client(lockfile)
    try:
        summoner = lcu.get("/lol-summoner/v1/current-summoner")
    except (HttpError, ConnectionError) as e:
        raise ImportFailed(f"Couldn't talk to the League client ({e}). Is it fully signed in?")
    puuid = summoner["puuid"]
    name = f"{summoner.get('gameName', '?')}#{summoner.get('tagLine', '?')}"

    owner = archive_owner(container, games)
    if owner and owner != puuid:
        raise ImportFailed(f"{out} belongs to a different account than {name}. Use a different archive.")

    known = {g.get("gameId") for g in games}
    progress(f"Signed in as {name}. {len(known)} games already in {out}.")

    token = sgp_token(lcu)
    host = find_sgp_host(lcu, puuid, token, sgp_host)
    ids, stop = walk_ids(host, puuid, token, SGP_MAYHEM_TAGS, known, full)
    if not ids:
        # An empty filtered walk could mean Riot renamed the queue tags, so
        # check every game the slow way before believing there are none
        progress("No Mayhem games by queue filter; checking all recent games instead.")
        ids, stop = walk_ids(host, puuid, token, SGP_ALL_TAGS, known, full)

    pending = [i for i in dict.fromkeys(ids) if i not in known]
    progress(f"Found {len(ids)} matching games; {len(pending)} are new.")

    added = failed = 0
    try:
        for n, game_id in enumerate(pending, 1):
            try:
                game = lcu.get(f"/lol-match-history/v1/games/{game_id}")
            except (HttpError, ConnectionError) as e:
                failed += 1
                progress(f"  [{n}/{len(pending)}] game {game_id}: {e}; a later run will retry it")
                continue
            if game.get("queueId") in MAYHEM_QUEUE_IDS:
                games.append(game)
                known.add(game_id)
                added += 1
            if n % 25 == 0 or n == len(pending):
                progress(f"  [{n}/{len(pending)}] {added} added")
            time.sleep(0.05)  # be gentle with the client
    except KeyboardInterrupt:
        progress("Stopped. Saving what was fetched so far.")

    mapped = 0
    try:
        mapped = fill_kill_maps(lcu, games, progress)
    except KeyboardInterrupt:
        mapped = 1  # some games may have changed; save them
        progress("Stopped. Saving what was fetched so far.")

    if added or mapped or container is None:
        save_archive(out, container, games, summoner)
    notes = []
    if failed:
        notes.append(f"{failed} games couldn't be fetched. Run again to retry them.")
    if stop == "page-limit":
        notes.append(f"Stopped at the {SGP_MAX_PAGES}-page safety limit; older games weren't checked.")
    elif stop == "exhausted" and history_window_full(host, puuid, token):
        notes.append(f"Only your last {SGP_HISTORY_CAP} matches (all queues) can be fetched. Older games can't be "
                     "fetched, but any already in the archive are kept.")
    progress(f"Done: {added} new Mayhem games added, {len(games)} in the archive.")
    for note in notes:
        progress(note)
    return {"added": added, "total": len(games), "failed": failed, "account": name, "notes": notes}


# ---------- local server for the dashboard's Sync button ----------
# A web page can't talk to the League client itself (its certificate and
# password are local), so this serves the dashboard and runs imports for it.
# It listens on 127.0.0.1 only and accepts sync requests only from its own
# pages: a POST needs the X-Mayhem header, which other sites can't send.

DASHBOARD_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "dashboard")


def serve(out, port, lockfile=None, sgp_host=None, open_browser=True):
    import http.server
    import threading
    import webbrowser

    state = {"running": False, "log": [], "result": None, "error": None}
    lock = threading.Lock()

    def sync_worker(full):
        def progress(msg):
            log(msg)
            with lock:
                state["log"] = (state["log"] + [msg.strip()])[-50:]
        try:
            result = run_import(out, full, lockfile, sgp_host, progress)
            with lock:
                state["result"] = result
        except (ImportFailed, HttpError, ConnectionError) as e:
            with lock:
                state["error"] = str(e)
        except Exception as e:  # keep the server up whatever happens
            with lock:
                state["error"] = f"Import failed: {e}"
        finally:
            with lock:
                state["running"] = False

    class Handler(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *a, **kw):
            super().__init__(*a, directory=DASHBOARD_DIR, **kw)

        def log_message(self, *a):
            pass

        def local_host(self):
            host = (self.headers.get("Host") or "").rsplit(":", 1)[0]
            return host in ("127.0.0.1", "localhost")

        def send_json(self, obj, code=200):
            body = json.dumps(obj).encode()
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            if not self.local_host():  # refuse DNS-rebinding lookalikes
                return self.send_json({"error": "forbidden"}, 403)
            path = self.path.split("?")[0]
            if path == "/api/sync":
                with lock:
                    return self.send_json(dict(state))
            if path == "/data/mayhem-backup.json":
                if not os.path.exists(out):
                    return self.send_json({"error": "no archive yet"}, 404)
                with open(out, "rb") as f:
                    body = f.read()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Cache-Control", "no-store")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                return self.wfile.write(body)
            return super().do_GET()

        def do_POST(self):
            if not self.local_host() or self.headers.get("X-Mayhem") != "1":
                return self.send_json({"error": "forbidden"}, 403)
            path, _, query = self.path.partition("?")
            if path != "/api/sync":
                return self.send_json({"error": "not found"}, 404)
            with lock:
                if not state["running"]:
                    state.update(running=True, log=[], result=None, error=None)
                    full = "full=1" in query.split("&")
                    threading.Thread(target=sync_worker, args=(full,), daemon=True).start()
                return self.send_json(dict(state), 202)

    server = http.server.ThreadingHTTPServer(("127.0.0.1", port), Handler)
    url = f"http://127.0.0.1:{port}/"
    log(f"Mayhem Stats is at {url} (archive: {out}). Press Ctrl+C to stop.")
    if open_browser:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


# ---------- main ----------

def main():
    ap = argparse.ArgumentParser(description="Import ARAM Mayhem games from the League client into a JSON archive.")
    ap.add_argument("-o", "--out", default=os.path.expanduser("~/Downloads/mayhem-backup.json"),
                    help="archive to create or merge into (default: ~/Downloads/mayhem-backup.json)")
    ap.add_argument("--full", action="store_true",
                    help="check every game Riot still serves, not just the new ones, to fill gaps")
    ap.add_argument("--lockfile", help="path to League's lockfile, if League isn't in /Applications")
    ap.add_argument("--serve", action="store_true",
                    help="open the stats dashboard with a Sync button instead of importing once")
    ap.add_argument("--port", type=int, default=8787, help="port for --serve (default 8787)")
    ap.add_argument("--no-browser", action="store_true", help=argparse.SUPPRESS)
    ap.add_argument("--sgp-host", help=argparse.SUPPRESS)  # for testing
    args = ap.parse_args()
    out = os.path.expanduser(args.out)

    if args.serve:
        return serve(out, args.port, args.lockfile, args.sgp_host, not args.no_browser)
    try:
        run_import(out, args.full, args.lockfile, args.sgp_host)
    except ImportFailed as e:
        sys.exit(str(e))


if __name__ == "__main__":
    main()
