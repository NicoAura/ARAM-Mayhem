# Mayhem Guide

The site's **Guide** tab (`/tools/guide`): how ARAM Mayhem works, read from the League client's own files.

- **What is Mayhem**: the mode's tutorial art, augment pool size by tier, and the Mayhem queue IDs.
- **Quests**: all 12 quest augments with every milestone and its reward (`ModesQuestData` in kiwi.bin).
- **Challenges**: the permanent ARAM challenges with every tier threshold, marked by whether they count Mayhem
  games (queue 2400 in `queueIds`). A Riot ID lookup appears once the site has a `/api/riot/challenges` route
  that returns Riot's `lol/challenges/v1/player-data/{puuid}` (`challenges: [{challengeId, level, value, percentile}]`).
- **Maps & extras**: the Howling Abyss map skins (minimaps), Mayhem-only items and Mayhem-only units.

Rebuild after a patch: `python3 -m pip install xxhash && python3 guide/build_data.py` (writes `data.js`).
Images load from CommunityDragon at view time. `site-tab.json` makes this folder a site tab.
