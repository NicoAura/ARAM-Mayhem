"""Bundle the Fun Tools tab into one self-contained HTML file (for an artifact preview).

Usage: python3 build_preview.py OUT.html
Inlines styles, scripts and data, and embeds every CommunityDragon icon as a data: URI,
because the preview page can't load anything from other sites. Python 3 standard library only.
"""
import base64, html, json, os, re, sys, urllib.request
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
TOOLS = [("ryze-calculator", "Infinite Ryze", "How far Ryze's AP to Mana loop goes with your items and augments."),
         ("heartsteel", "Heartsteel Quest", "How much Health a tank snowballs to with Heartsteel and Steel Your Heart."),
         ("zero-cooldowns", "Zero Cooldowns", "How close any champion gets to casting nonstop with Ability Haste items and augments."),
         ("stacking-timer", "Stacking Timer", "How fast Veigar, Nasus, Senna and Smolder stack, and when they hit each goal.")]
ICON = re.compile(r"https://raw\.communitydragon\.org/[^\"']+?\.png")


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "aram-mayhem-fun-tools"})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                return url, "data:image/png;base64," + base64.b64encode(r.read()).decode()
        except Exception as e:  # a missing icon just shows the empty frame
            if attempt == 2:
                print("icon failed:", url, e)
    return url, ""


def read(path):
    with open(os.path.join(HERE, path), encoding="utf-8") as f:
        return f.read()


def inline_page(folder, icons):
    """One tool's index.html with its CSS, data and scripts inlined."""
    page = read(f"{folder}/index.html")
    page = page.replace('<link rel="stylesheet" href="../style.css">', "<style>" + read("style.css") + "\n#share{display:none}</style>")

    def script(m):
        js = read(f"{folder}/{m.group(1)}")
        js = ICON.sub(lambda u: icons.get(u.group(0), u.group(0)), js)
        return "<script>" + js.replace("</script", "<\\/script") + "</script>"

    page = re.sub(r'<script src="([^"]+)"></script>', script, page)
    # The eyebrow links back to the hub; inside the preview that is the parent's job.
    return page.replace('<a href="../index.html">Fun Tools</a>', '<a href="#" onclick="parent.postMessage(\'fun-home\',\'*\');return false">Fun Tools</a>')


def main(out):
    urls = set()
    for folder, _, _ in TOOLS:
        urls |= set(ICON.findall(read(f"{folder}/data.js")))
    with ThreadPoolExecutor(16) as ex:
        icons = dict(ex.map(fetch, sorted(urls)))
    pages = {folder: inline_page(folder, icons) for folder, _, _ in TOOLS}
    shell = read("preview_shell.html")
    cards = "\n".join(
        f'<button class="tool-card" type="button" data-go="{f}"><span class="tool-name">{html.escape(n)}</span>'
        f'<span class="tool-desc">{html.escape(d)}</span></button>' for f, n, d in TOOLS)
    tabs = "\n".join(f'<button class="tab" type="button" role="tab" id="tab-{f}" data-go="{f}">{html.escape(n)}</button>' for f, n, _ in TOOLS)
    frames = "\n".join(f'<section class="panel" id="panel-{f}" role="tabpanel" hidden><iframe title="{html.escape(n)}" data-src="{f}"></iframe></section>'
                       for f, n, _ in TOOLS)
    shell = (shell.replace("<!--CARDS-->", cards).replace("<!--TABS-->", tabs).replace("<!--FRAMES-->", frames)
             .replace("/*PAGES*/null", json.dumps(pages).replace("</", "<\\/")))
    with open(out, "w", encoding="utf-8") as f:
        f.write(shell)
    print(f"wrote {out}: {len(shell) / 1e6:.1f} MB, {sum(1 for v in icons.values() if v)} icons")


if __name__ == "__main__":
    main(sys.argv[1])
