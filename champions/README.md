# Mayhem Champions

One page per champion at `/champions#Alias` (e.g. `#MonkeyKing`). The nav tab is hidden; pages are reached from the
Tier List, search and the Home champion search. `site-tab.json` still makes sync-embeds copy this folder.

- **Builds** (Mayhem match stats from 101.qq.com, read from `data/cn/builds/{id}.json`, which the My Stats
  thread refreshes daily): most-picked augments by tier with grade,
  starting items, boots, core three-item paths, full builds, most-built items, skill max/level orders and best
  teammates, each with win and pick rate. There are no per-champion augment win rates.
- **Builds by style**: each core path and full build is sorted into a style (Crit, On-hit, AP, Lethality, AD, Tank,
  Enchanter) from its items' shop categories (`item_style`). Each style shows its share of the core paths, pick-weighted
  win rate, core paths, full builds, other finished items of that style the champion builds, and the champion's
  most-picked augments that fit the style (matched on the augment's internal name and its spell's value names in
  `kiwi.bin`, `AUG_STYLE`; augments matching more than three styles are left out as generic).
- **Mayhem changes**: every ability number Mayhem changes, from each champion's bin
  (`game/data/characters/{alias}/{alias}.bin.json`): `DataValuesModeOverride` (ARAM, then Kiwi on top) and the
  per-mode cooldown override `{f9c2333e}`, compared with the Summoner's Rift values.
- **Abilities**, title, roles, splash and pick quote from `v1/champions/{id}.json`.
- **Tier List stats** from `data/cn/champions.csv`.

Not in the client: per-champion damage dealt/taken, healing, tenacity and ability haste adjustments.

Rebuild: `python3 champions/build_data.py` (live patch, standard library only; writes `data.js`). Build stats change
daily, so the daily routine should rerun it. Page text doesn't mention where data comes from (Nico, 2026-10-16).

## Base stats and skins

Each champion page has a Base stats table (level 1, growth per level and level 18, from the champion's game data)
and a Skins grid. Skin tiles are in `skins.js`, which the page loads only when the Skins section scrolls into view.

Build stats leave out items that only augments give (quest rewards such as Wooglet's Witchcap or the Golden
Spatula). The list comes from `guide/augment_rules.json`, so run `guide/build_data.py` first after a patch.

## Champion tags

`build_data.py` also writes `tags.json`, for colour-coded tags on the site. For each champion it lists:
- **roles:** the official roles from the game files.
- **classes / subclasses:** Riot's classes and subclasses (Enchanter, Catcher, Juggernaut, Diver, Burst,
  Battlemage, Artillery, Marksman, Assassin, Skirmisher, Vanguard, Warden, Specialist). These are hand-kept in
  `classes.py` because no game file has them. New champions start without one until they're added there.
- **playstyles:** Poke, Engage, Sustain, Shields/Heals and Crowd control, read from ability text and range plus the
  subclass.

`colors` gives one colour per tag, and `meanings` gives a one-line description of each.
