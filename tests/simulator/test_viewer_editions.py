"""The fight replay ships in two editions: the public index.html (2D, no game models, sounds or clips)
and the admin full.html, generated from it by simulator/tools/make_full_viewer.py."""
import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
VIEWER = ROOT / "simulator" / "viewer"


def _maker():
    spec = importlib.util.spec_from_file_location("make_full_viewer", ROOT / "simulator" / "tools" / "make_full_viewer.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_full_edition_is_up_to_date():
    public = (VIEWER / "index.html").read_text()
    assert (VIEWER / "full.html").read_text() == _maker().full_html(public), "run python3 simulator/tools/make_full_viewer.py"


def test_public_edition_loads_no_game_models():
    public = (VIEWER / "index.html").read_text()
    assert 'data-edition="public"' in public
    assert "models3d.js" not in public and "importmap" not in public
    full = (VIEWER / "full.html").read_text()
    assert 'data-edition="full"' in full and "models3d.js" in full
