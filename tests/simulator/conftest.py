"""Shared fixtures for the Simulator's regression tests (tests/simulator/).

The binaries are built once per test session with `make -C simulator mayhem_sim yunara_sim`
(make skips the build when they are already up to date) and every run uses a fixed seed, so
the results are deterministic (simulator/README.md, "Reproducibility").

Snapshots: tests/simulator/snapshots.json pins the outputs of test_sim_snapshots.py. After a
deliberate tuning change (e.g. the daily patch-day accuracy tuning), re-pin with

    UPDATE_SNAPSHOTS=1 python3 -m pytest tests/simulator/test_sim_snapshots.py

and commit the rewritten snapshots.json alongside the tuning change.
"""
from __future__ import annotations

import json
import os
import subprocess

import pytest

from sim_paths import DATA_DIR, SIM_DIR, load_json

# Generous per-run limit: every run in this suite finishes in well under a few seconds,
# so hitting it means the simulator hung.
RUN_TIMEOUT = 60


@pytest.fixture(scope="session")
def sim_bins():
    """Build mayhem_sim and yunara_sim once per session; returns {name: path}."""
    proc = subprocess.run(
        ["make", "-C", str(SIM_DIR), "mayhem_sim", "yunara_sim"],
        capture_output=True, text=True, timeout=600,
    )
    if proc.returncode != 0:
        pytest.fail("building the simulator failed:\n" + proc.stdout[-4000:] + proc.stderr[-4000:])
    bins = {name: SIM_DIR / name for name in ("mayhem_sim", "yunara_sim")}
    for name, path in bins.items():
        assert path.is_file() and os.access(path, os.X_OK), f"{name} was not built"
    return bins


@pytest.fixture(scope="session")
def run_sim(sim_bins):
    """run_sim("mayhem_sim", [...args]) -> CompletedProcess, run from simulator/ (default data paths)."""

    def _run(binary: str, args, timeout: float = RUN_TIMEOUT, check: bool = False):
        cmd = [str(sim_bins[binary]), *[str(a) for a in args]]
        try:
            proc = subprocess.run(cmd, cwd=SIM_DIR, capture_output=True, text=True, timeout=timeout)
        except subprocess.TimeoutExpired:
            pytest.fail(f"{binary} hung (no exit within {timeout} s): {' '.join(cmd[1:])}")
        if check and proc.returncode != 0:
            pytest.fail(f"{binary} {' '.join(cmd[1:])} exited {proc.returncode}:\n{proc.stderr[-3000:]}")
        return proc

    return _run


@pytest.fixture(scope="session")
def run_json(run_sim):
    """run_json("mayhem_sim", [...]) -> parsed stdout of a successful --json run.

    Runs are deterministic, so identical commands are cached for the session (callers get a
    fresh copy and may modify it).
    """
    cache = {}

    def _run(binary: str, args, timeout: float = RUN_TIMEOUT):
        key = (binary, tuple(str(a) for a in args))
        if key not in cache:
            proc = run_sim(binary, args, timeout=timeout, check=True)
            try:
                json.loads(proc.stdout)
            except json.JSONDecodeError as exc:
                pytest.fail(f"{binary} {' '.join(map(str, args))} printed invalid JSON ({exc}):\n{proc.stdout[:2000]}")
            cache[key] = proc.stdout
        return json.loads(cache[key])

    return _run


@pytest.fixture(scope="session")
def list_json(run_json):
    """`mayhem_sim --list --json` (live patch), the contract the website and viewer read."""
    return run_json("mayhem_sim", ["--list", "--json"])


@pytest.fixture(scope="session")
def live_data():
    return {
        "champions": load_json(DATA_DIR / "champions.json")["champions"],
        "items": load_json(DATA_DIR / "items.json")["items"],
        "augments": load_json(DATA_DIR / "augments.json")["augments"],
    }
