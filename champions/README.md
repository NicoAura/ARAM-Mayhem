# Mayhem Champions

One page per champion at `/champions#Alias` (e.g. `#MonkeyKing`). The nav tab is hidden; pages are reached from the
Tier List, search and the Home champion search. `site-tab.json` still makes sync-embeds copy this folder.

- **Builds** (Mayhem match stats from 101.qq.com, read from `data/cn/builds/{id}.json`, which the My Stats
  thread refreshes daily): most-picked augments by tier with grade,
  starting items, boots, core three-item paths, full builds, most-built items, skill max/level orders and best
  teammates, each with win and pick rate. There are no per-champion augment win rates.
- **Mayhem changes**: every ability number Mayhem changes, from each champion's bin
  (`game/data/characters/{alias}/{alias}.bin.json`): `DataValuesModeOverride` (ARAM, then Kiwi on top) and the
  per-mode cooldown override `{f9c2333e}`, compared with the Summoner's Rift values.
- **Abilities**, title, roles, splash and pick quote from `v1/champions/{id}.json`.
- **Tier List stats** from `data/cn/champions.csv`.

Not in the client: per-champion damage dealt/taken, healing, tenacity and ability haste adjustments.

Rebuild: `python3 champions/build_data.py` (live patch, standard library only; writes `data.js`). Build stats change
daily, so the daily routine should rerun it. Page text doesn't mention where data comes from (Nico, 2026-10-16).
