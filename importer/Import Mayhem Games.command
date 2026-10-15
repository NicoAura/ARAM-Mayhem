#!/bin/bash
# Double-click in Finder to import new ARAM Mayhem games into
# ~/Downloads/mayhem-backup.json. League must be running and signed in.
cd "$(dirname "$0")"
python3 mayhem_import.py "$@"
echo
read -n 1 -s -r -p "Press any key to close."
