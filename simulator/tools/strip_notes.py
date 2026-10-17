#!/usr/bin/env python3
"""Copy simulator data files without their maintainer notes, for what ships to the browser.

The repo's data files explain where each value comes from (notes, why, mode_overrides, meta).
The engine reads none of that, and the site shows no data origins, so the copies embedded in
the WebAssembly build and served to the viewer leave it out.

    python3 tools/strip_notes.py OUT_DIR data/champions.json data/items.json ...
"""
import json
import os
import sys

DROP = {"note", "notes", "why", "mode_overrides", "built_at"}


def strip(v):
    if isinstance(v, dict):
        out = {}
        for k, x in v.items():
            if k in DROP or k.startswith("_") or k.endswith("_note"):
                continue
            if k == "meta" and isinstance(x, dict):
                # Keep only the fields the engine reads.
                x = {m: x[m] for m in ("champion_stat_date",) if m in x}
                x["source"] = "Mayhem match statistics"
            out[k] = strip(x)
        return out
    if isinstance(v, list):
        return [strip(x) for x in v]
    return v


def main():
    out_dir, files = sys.argv[1], sys.argv[2:]
    os.makedirs(out_dir, exist_ok=True)
    for f in files:
        with open(f, encoding="utf-8") as fh:
            data = json.load(fh)
        with open(os.path.join(out_dir, os.path.basename(f)), "w", encoding="utf-8") as fh:
            json.dump(strip(data), fh, separators=(",", ":"), ensure_ascii=False)


if __name__ == "__main__":
    main()
