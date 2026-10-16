# Mayhem Champions

The site's **Champions** tab (`/tools/champions`): one page per champion (`#Alias` opens it).

- **Mayhem changes**: every ability number Mayhem changes, from each champion's bin
  (`game/data/characters/{alias}/{alias}.bin.json`): `DataValuesModeOverride` (ARAM, then Kiwi on top) and the
  per-mode cooldown override `{f9c2333e}`, compared with the Summoner's Rift values.
- **Abilities**, title, roles, splash and pick quote from `v1/champions/{id}.json`; base stats from the CharacterRecord.
- **Riot's ARAM build**: the shop's suggestion (`ItemRecommendationOverride` for map 12, ARAM).
- **Tier List stats** from `data/cn/champions.csv` and the **Simulator's best build** from
  `simulator/viewer/replay-data/best-builds.json`, both already in the repo.

Not in the client: per-champion damage dealt/taken, healing, tenacity and ability haste adjustments. Riot applies
those on the game server, so they aren't shown.

Rebuild after a patch: `python3 champions/build_data.py` (live patch, standard library only; writes `data.js`).
Page text doesn't mention where data comes from (Nico, 2026-10-16). `site-tab.json` makes this folder a site tab.
