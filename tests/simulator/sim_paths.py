"""Paths and small helpers shared by the Simulator tests (a uniquely named module, so it can't
collide with another directory's conftest.py when pytest puts several test dirs on sys.path)."""
from __future__ import annotations

import json
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
SIM_DIR = REPO / "simulator"
DATA_DIR = SIM_DIR / "data"
PBE_DIR = DATA_DIR / "pbe"
VIEWER_DIR = SIM_DIR / "viewer"


def load_json(path: Path):
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)
