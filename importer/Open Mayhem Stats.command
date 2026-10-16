#!/bin/bash
# Double-click in Finder to open the stats dashboard with a Sync button that
# pulls new games from League into ~/Downloads/mayhem-backup.json.
# Keep this window open while you use the page; close it to stop.
cd "$(dirname "$0")"
python3 mayhem_import.py --serve "$@"
