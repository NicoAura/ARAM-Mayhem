"""Pack the Cook Builds page into one self-contained HTML file (styles, data and icons inlined).

Usage: python3 data/cook-builds/build_preview.py OUT.html
"""
import base64, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))


def read(name):
    with open(os.path.join(HERE, name), encoding="utf-8") as f:
        return f.read()


def main(out):
    icons = {}
    for sub in ("champions", "augments"):
        for name in sorted(os.listdir(os.path.join(HERE, "icons", sub))):
            with open(os.path.join(HERE, "icons", sub, name), "rb") as f:
                icons[f"icons/{sub}/{name}"] = "data:image/png;base64," + base64.b64encode(f.read()).decode()
    icon_js = "window.COOK_ICONS = " + repr(icons).replace("'", '"') + ";"
    html = read("index.html")
    html = html.replace('<link rel="stylesheet" href="style.css">', "<style>\n" + read("style.css") + "</style>")
    scripts = "\n".join(f"<script>\n{s}\n</script>" for s in (read("data.js"), icon_js, read("app.js")))
    html = re.sub(r'<script src="data.js"></script>\s*<script src="app.js"></script>', lambda m: scripts, html)
    # Artifact pages get their own document skeleton, so keep only the title, styles and body content.
    html = re.sub(r"<!doctype html>|</?html[^>]*>|</?head>|</?body>|<meta [^>]*>", "", html).strip() + "\n"
    with open(out, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"wrote {out} ({os.path.getsize(out) // 1024} KB)")


if __name__ == "__main__":
    main(sys.argv[1])
