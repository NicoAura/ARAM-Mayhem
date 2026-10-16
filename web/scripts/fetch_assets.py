"""Mirror every image, sound, model, clip, font and script the site's pages use into web/public/assets/,
so the whole site loads from deeparam.com.

Where things land (the full map, for the other tabs, is /mnt/project-files/website/assets-map.md):
  raw.communitydragon.org/<channel>/<path>   -> /assets/cd/<channel>/<path, lower case>   (channel: latest or pbe)
  ddragon.leagueoflegends.com/cdn/<v>/img/<p> -> /assets/dd/<v>/img/<p>                  (live patch's version only)
  ability preview clips <k>/ability_<k>_<s>1.webm -> /assets/clips/<k>/ability_<k>_<s>1.webm (re-encoded, 480 px)
  cdn.modelviewer.lol/lol/models/<id>/<n>/model.glb -> /assets/models/<id>/<n>/model.glb + models.json
                                                  (slimmed: the replay's clips only, 512 px WebP textures)
  Google Fonts (Bricolage Grotesque, Geist, Geist Mono) -> /assets/fonts/fonts.css
  three.js 0.160.0 (the replay's 3D)           -> /assets/lib/three-0.160.0/{build,examples/jsm}/...
Player profile icons (5,000+) aren't mirrored; the site serves them at /assets/profile-icon/<id>.jpg.

What gets fetched: every such URL written anywhere in the repo's pages and data, plus the sets pages build
from ids at runtime (each champion's icon, pick quote, client JSON, splash and ability icons; items; augments;
the Howling Abyss minimaps; the replay's ability icons, clips and models). /assets/manifest.json records the
live patch and what was fetched.

Usage (from the repo root):
  python3 web/scripts/fetch_assets.py           # icons, splashes, sounds, JSON, fonts, three.js (new files only)
  python3 web/scripts/fetch_assets.py --refresh # also re-download files already present (after a patch)
  python3 web/scripts/fetch_assets.py --clips   # + ability clips (needs ffmpeg)
  python3 web/scripts/fetch_assets.py --models  # + 3D models (needs node and the glTF tools, see below)

--models runs simulator/tools/build_models.mjs, which needs:
  npm install --prefix /tmp/gltf @gltf-transform/cli@4 @gltf-transform/core@4 @gltf-transform/extensions@4 meshoptimizer
and is run with GLTF_MODULES=/tmp/gltf/node_modules (default).
"""
import argparse, concurrent.futures as cf, json, os, re, shutil, subprocess, sys, tempfile, time, urllib.parse, urllib.request
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.normpath(os.path.join(HERE, ".."))
REPO = os.path.normpath(os.path.join(WEB, ".."))
OUT = os.path.join(WEB, "public", "assets")

CD = "https://raw.communitydragon.org"
GD = "plugins/rcp-be-lol-game-data/global/default"
DD = "https://ddragon.leagueoflegends.com"
CLIPS = "https://d28xe8vt774jo5.cloudfront.net/champion-abilities"
FONTS = ("https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700"
         "&family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500;600&display=swap")
THREE = "https://cdn.jsdelivr.net/npm/three@0.160.0"
THREE_ENTRIES = ["build/three.module.js", "examples/jsm/loaders/GLTFLoader.js",
                 "examples/jsm/libs/meshopt_decoder.module.js", "examples/jsm/utils/SkeletonUtils.js"]
MINIMAPS = ["2dlevelminimap", "2dlevelminimap_bloom", "2dlevelminimap_bilgewater2", "2dlevelminimap_crepe"]
CAP = 25 * 1024 * 1024 - 64 * 1024  # Cloudflare serves static files up to 25 MiB
UA = {"User-Agent": "deeparam-assets"}  # CommunityDragon refuses Python's default User-Agent
# A modern browser's User-Agent, so Google Fonts answers with WOFF2.
FONT_UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) "
                         "Chrome/126.0 Safari/537.36"}

ASSET_EXT = r"png|jpe?g|webp|svg|gif|ogg|mp3|wav|webm|mp4|glb|json"
URL_RE = re.compile(
    r"https://(?:raw\.communitydragon\.org/(?:latest|pbe|\d+\.\d+)/|ddragon\.leagueoflegends\.com/cdn/)"
    r"[^\s\"'`<>()\\]+?\.(?:" + ASSET_EXT + r")(?=[\s\"'`<>()\\?#]|$)", re.I)
# Pages that already point at the mirror (/assets/cd/<channel>/..., /assets/dd/<ver>/img/...) still name a
# source file, so they keep getting mirrored after a patch.
LOCAL_RE = re.compile(
    r"/assets/(cd/(?:latest|pbe)/|dd/[\d.]+/img/)[^\s\"'`<>()\\]+?\.(?:" + ASSET_EXT + r")(?=[\s\"'`<>()\\?#]|$)", re.I)
SCAN_EXT = {".js", ".mjs", ".ts", ".tsx", ".json", ".html", ".css", ".csv"}
SCAN_SKIP = {".git", "node_modules", ".next", ".open-next", "mac-imports", "assets", "embed", "importer"}


def fetch(url, headers=UA, tries=4):
    req = urllib.request.Request(url, headers=headers)
    for attempt in range(tries):
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code in (403, 404):
                raise
            if attempt == tries - 1:
                raise
        except OSError:
            if attempt == tries - 1:
                raise
        time.sleep(2 ** attempt)


def local_path(url):
    """The file under OUT that mirrors an outside URL, or None if it isn't one we mirror."""
    u = urllib.parse.urlsplit(url)
    if u.netloc == "raw.communitydragon.org":
        channel, _, rest = u.path.lstrip("/").partition("/")
        return f"cd/{channel}/{urllib.parse.unquote(rest).lower()}"
    if u.netloc == "ddragon.leagueoflegends.com":
        m = re.match(r"/cdn/([\d.]+)/img/(.+)", u.path)
        return f"dd/{m.group(1)}/img/{urllib.parse.unquote(m.group(2))}" if m else None
    return None


def scan_repo():
    """Every asset URL written literally in the repo's pages and data."""
    found = set()
    for root, dirs, files in os.walk(REPO):
        dirs[:] = [d for d in dirs if d not in SCAN_SKIP and not d.startswith(".")]
        for f in files:
            if os.path.splitext(f)[1].lower() not in SCAN_EXT:
                continue
            try:
                text = open(os.path.join(root, f), encoding="utf-8", errors="ignore").read()
            except OSError:
                continue
            found.update(m.group(0) for m in URL_RE.finditer(text))
            found.update(source_url(m.group(0)) for m in LOCAL_RE.finditer(text))
    return found


def source_url(path):
    """/assets/cd/latest/x.png -> its CommunityDragon URL; /assets/dd/<ver>/img/x.png -> its Data Dragon URL."""
    rest = path.removeprefix("/assets/")
    if rest.startswith("cd/"):
        return f"{CD}/{rest[3:]}"
    ver, _, img = rest[3:].partition("/")
    return f"{DD}/cdn/{ver}/{img}"


def client_path(p):
    """/lol-game-data/assets/ASSETS/... as the client writes it -> its CommunityDragon URL."""
    return f"{CD}/latest/{GD}/{p.replace('/lol-game-data/assets/', '').lower()}" if p else None


def real_champion(c):
    # The summary also lists placeholder (-1) and game-mode bot entries (ids from 60000 up).
    return 0 < c["id"] < 10000


def runtime_sets(summary, champ_json):
    """URLs pages build from ids at runtime, so no literal scan finds them."""
    urls = {f"{CD}/latest/{GD}/v1/{f}" for f in
            ["champion-summary.json", "items.json", "cherry-augments.json", "summoner-spells.json"]}
    urls.add(f"{CD}/latest/cdragon/arena/en_us.json")
    urls.update(f"{CD}/latest/game/assets/maps/info/map12/{m}.png" for m in MINIMAPS)
    urls.add(f"{CD}/latest/game/assets/spells/icons2d/porocharge_quest2.png")
    for c in summary:
        if not real_champion(c):
            continue
        for f in (f"champion-icons/{c['id']}.png", f"champion-choose-vo/{c['id']}.ogg", f"champions/{c['id']}.json"):
            urls.add(f"{CD}/latest/{GD}/v1/{f}")
        data = champ_json.get(c["id"])
        if data:
            base = data["skins"][0]
            # The champion panel shows the base skin's full (uncentered) splash.
            urls.add(client_path(base.get("uncenteredSplashPath") or base.get("splashPath")))
            for a in [data.get("passive", {})] + data.get("spells", []):
                if a.get("abilityIconPath"):
                    urls.add(client_path(a["abilityIconPath"]))
    return urls


def save(url, force):
    rel = local_path(url)
    dst = os.path.join(OUT, rel)
    if os.path.exists(dst) and not force:
        return rel, 0, None
    try:
        body = fetch(url)
    except urllib.error.HTTPError as e:
        # A few icons pages name under latest/ exist only on PBE until the patch ships.
        if e.code != 404 or "/latest/" not in url:
            return rel, 0, str(e)
        try:
            body = fetch(url.replace("/latest/", "/pbe/", 1))
        except Exception as e2:  # noqa: BLE001
            return rel, 0, str(e2)
    except Exception as e:  # noqa: BLE001 — one missing file shouldn't stop the run
        return rel, 0, str(e)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    with open(dst, "wb") as f:
        f.write(body)
    return rel, len(body), None


def fetch_all(urls, force, label):
    new = errors = 0
    with cf.ThreadPoolExecutor(16) as pool:
        for rel, n, err in pool.map(lambda u: save(u, force), sorted(urls)):
            if err:
                errors += 1
                print(f"  {label}: {rel} failed ({err})")
            elif n:
                new += 1
    print(f"{label}: {len(urls)} files, {new} downloaded, {errors} failed")
    return errors


def fetch_fonts():
    css = fetch(FONTS, FONT_UA).decode()
    os.makedirs(os.path.join(OUT, "fonts"), exist_ok=True)

    def local(m):
        url = m.group(1)
        name = re.sub(r"[^A-Za-z0-9._-]", "_", urllib.parse.urlsplit(url).path.strip("/").replace("/", "-"))
        dst = os.path.join(OUT, "fonts", name)
        if not os.path.exists(dst):
            with open(dst, "wb") as f:
                f.write(fetch(url, FONT_UA))
        return f"url(/assets/fonts/{name})"

    css = re.sub(r"url\((https://fonts\.gstatic\.com/[^)]+)\)", local, css)
    with open(os.path.join(OUT, "fonts", "fonts.css"), "w") as f:
        f.write("/* Bricolage Grotesque, Geist and Geist Mono (SIL Open Font License). */\n" + css)
    print("fonts: fonts.css written")


def fetch_three():
    """three.js's module build plus the addons the replay imports, and everything those import."""
    todo, seen = list(THREE_ENTRIES), set()
    while todo:
        rel = todo.pop()
        if rel in seen:
            continue
        seen.add(rel)
        dst = os.path.join(OUT, "lib", "three-0.160.0", rel)
        if os.path.exists(dst):
            body = open(dst, "rb").read()
        else:
            body = fetch(f"{THREE}/{rel}")
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            with open(dst, "wb") as f:
                f.write(body)
        for spec in re.findall(rb"""(?:import|export)[^'"]*?from\s*['"]([^'"]+)['"]""", body):
            spec = spec.decode()
            if spec.startswith("."):
                todo.append(os.path.normpath(os.path.join(os.path.dirname(rel), spec)))
    print(f"three.js: {len(seen)} files (import map: \"three\" -> /assets/lib/three-0.160.0/build/three.module.js)")


def replay_index():
    with open(os.path.join(REPO, "simulator", "viewer", "replay-data", "index.json")) as f:
        return json.load(f)


def fetch_clips(force):
    """Each champion's ability preview clips, re-encoded to 480 px VP9 (about 1/20 the size)."""
    if not shutil.which("ffmpeg"):
        sys.exit("--clips needs ffmpeg")
    jobs = []
    for c in replay_index()["champions"]:
        k = str(c["key"]).zfill(4)
        for slot in ("Q", "W", "E", "R"):
            jobs.append((k, f"ability_{k}_{slot}1.webm"))

    def one(job):
        k, name = job
        dst = os.path.join(OUT, "clips", k, name)
        if os.path.exists(dst) and not force:
            return 0, None
        try:
            raw = fetch(f"{CLIPS}/{k}/{name}")
        except Exception as e:  # noqa: BLE001
            return 0, f"{k}/{name}: {e}"
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        with tempfile.TemporaryDirectory() as tmp:
            src, out = os.path.join(tmp, "in.webm"), os.path.join(tmp, "out.webm")
            open(src, "wb").write(raw)
            r = subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src, "-vf", "scale=480:-2", "-c:v", "libvpx-vp9",
                                "-crf", "42", "-b:v", "0", "-row-mt", "1", "-deadline", "good", "-cpu-used", "4",
                                "-c:a", "libopus", "-b:a", "48k", out], capture_output=True)
            if r.returncode:
                return 0, f"{k}/{name}: ffmpeg failed"
            shutil.move(out, dst)
        return 1, None

    new = errors = 0
    with cf.ThreadPoolExecutor(max(2, (os.cpu_count() or 4) // 2)) as pool:
        for n, err in pool.map(one, jobs):
            new += n
            if err:
                errors += 1
                print("  clips:", err)
    print(f"clips: {len(jobs)} clips, {new} encoded, {errors} missing")


def fetch_models(force):
    mods = os.environ.get("GLTF_MODULES", "/tmp/gltf/node_modules")
    out = os.path.join(OUT, "models")
    args = ["node", "tools/build_models.mjs", "--index", "viewer/replay-data/index.json", "--out", out]
    if not force and os.path.exists(os.path.join(out, "models.json")):
        have = {k.lower() for k in json.load(open(os.path.join(out, "models.json")))}
        missing = [c["id"] for c in replay_index()["champions"] if c["id"].lower() not in have]
        if not missing:
            relayout_models()
            return
        args += ["--only", ",".join(missing)]
    subprocess.run(args, cwd=os.path.join(REPO, "simulator"), env={**os.environ, "NODE_PATH": mods}, check=True)
    relayout_models()


def relayout_models():
    """build_models.mjs writes <Id>.glb; move each to <id>/<key*1000>/model.glb, the path the full model has."""
    out = os.path.join(OUT, "models")
    path = os.path.join(out, "models.json")
    if not os.path.exists(path):
        return
    keys = {c["id"]: c["key"] for c in replay_index()["champions"]}
    manifest = json.load(open(path))
    for cid, entry in manifest.items():
        rel = f"{cid.lower()}/{keys[cid] * 1000}/model.glb"
        src = os.path.join(out, entry["file"])
        if entry["file"] != rel and os.path.exists(src):
            os.makedirs(os.path.dirname(os.path.join(out, rel)), exist_ok=True)
            shutil.move(src, os.path.join(out, rel))
        entry["file"] = rel
    json.dump(manifest, open(path, "w"))
    print(f"models: {len(manifest)} champions")


def split_large():
    """Cloudflare won't serve a static file over 25 MiB: split any such file into .part0, .part1, ..."""
    split = {}
    for root, _, files in os.walk(OUT):
        for f in files:
            p = os.path.join(root, f)
            if ".part" in f or os.path.getsize(p) <= CAP:
                continue
            data = open(p, "rb").read()
            parts = [data[i:i + CAP] for i in range(0, len(data), CAP)]
            for i, chunk in enumerate(parts):
                open(f"{p}.part{i}", "wb").write(chunk)
            os.remove(p)
            split[os.path.relpath(p, OUT)] = len(parts)
    return split


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--refresh", action="store_true", help="download files that already exist again")
    ap.add_argument("--clips", action="store_true", help="also mirror ability preview clips (ffmpeg)")
    ap.add_argument("--models", action="store_true", help="also build the 3D champion models")
    args = ap.parse_args()
    os.makedirs(OUT, exist_ok=True)

    summary = json.loads(fetch(f"{CD}/latest/{GD}/v1/champion-summary.json"))
    champ_json = {}

    def load_champ(cid):
        path = os.path.join(OUT, "cd", "latest", GD, "v1", "champions", f"{cid}.json")
        if os.path.exists(path) and not args.refresh:
            return cid, json.load(open(path))
        try:
            return cid, json.loads(fetch(f"{CD}/latest/{GD}/v1/champions/{cid}.json"))
        except Exception:  # noqa: BLE001
            return cid, None

    with cf.ThreadPoolExecutor(16) as pool:
        champ_json = dict(pool.map(load_champ, [c["id"] for c in summary if real_champion(c)]))

    literal = scan_repo()
    literal = {u for u in literal if "${" not in u and "{" not in u}
    cd_urls = {u for u in literal | runtime_sets(summary, champ_json) if u and local_path(u)}

    index = replay_index()
    ver = index.get("ddragon_version") or json.loads(fetch(f"{DD}/api/versions.json"))[0]
    base = index.get("icon_base", "")
    icons = [rel for c in index["champions"] for rel in c.get("icons", [])]
    if base.startswith("/assets/"):  # the replay names the mirrored client files directly
        cd_urls |= {source_url(base + rel.lower()) for rel in icons}
        dd_urls = set()
    else:
        dd_urls = {f"{DD}/cdn/{ver}/img/{rel}" for rel in icons}
    cd_urls -= {u for u in cd_urls if "ddragon" in u}
    dd_urls |= {u for u in literal if "ddragon" in u}

    errors = fetch_all(cd_urls, args.refresh, "client files")
    errors += fetch_all(dd_urls, args.refresh, "replay icons")
    for old in os.listdir(os.path.join(OUT, "dd")):  # keep only the live patch's copies
        if old != ver:
            shutil.rmtree(os.path.join(OUT, "dd", old))
    fetch_fonts()
    fetch_three()
    if args.clips:
        fetch_clips(args.refresh)
    if args.models:
        fetch_models(args.refresh)
    split = split_large()

    versions = json.loads(fetch(f"{DD}/api/versions.json"))
    patch = ".".join(versions[0].split(".")[:2])
    counts, total = {}, 0
    for root, _, files in os.walk(OUT):
        for f in files:
            if f == "manifest.json":
                continue
            top = os.path.relpath(root, OUT).split(os.sep)[0]
            counts[top] = counts.get(top, 0) + 1
            total += os.path.getsize(os.path.join(root, f))
    manifest = {"patch": patch, "ddragon_version": versions[0], "updated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                "files": counts, "bytes": total, "split": split}
    with open(os.path.join(OUT, "manifest.json"), "w") as f:
        json.dump(manifest, f, indent=1)
    print(f"done: patch {patch}, {sum(counts.values())} files, {total / 1e6:.1f} MB" + (f", {errors} failed" if errors else ""))


if __name__ == "__main__":
    main()
