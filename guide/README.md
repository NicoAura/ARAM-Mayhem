# Mayhem Info

The site's **Info** tab (formerly Guide) (`/tools/guide`): how ARAM Mayhem works, read from the League client's own files.

- **What is Mayhem**: the mode's tutorial art, augment pool size by tier, and the Mayhem queue IDs.
- **Quests**: all 12 quest augments with every milestone and its reward (`ModesQuestData` in kiwi.bin).
- **Challenges**: the permanent ARAM challenges with every tier threshold, marked by whether they count Mayhem
  games (queue 2400 in `queueIds`). A Riot ID lookup appears once the site has a `/api/riot/challenges` route
  that returns Riot's `lol/challenges/v1/player-data/{puuid}` (`challenges: [{challengeId, level, value, percentile}]`).
- **Rules**: Mayhem's mode-wide settings from map12.bin (`Kiwi_Balance`, `Kiwi_OnFireBuff`, `Kiwi_ComboBreaker`,
  `ARAM_Augment_Manager`), the summoner spells allowed in Mayhem, and augments that add one.
- **Items**: items whose `DataValuesModeOverride` (Kiwi, else ARAM) differs from Summoner's Rift, from items.cdtb.bin.
- **Augment history**: every augment change from patch 16.2 (the first patch whose kiwi.bin CommunityDragon exports)
  to the live patch: pool additions and removals, tier changes and each changed number. Built by `build_history.py`
  from CommunityDragon's per-patch folders; never reads PBE.
- **Archive**: features from past Mayhem seasons. Augment Sets: names and bonus text still in the string table.
- **Maps & extras**: the Howling Abyss map skins (minimaps), Mayhem-only items and Mayhem-only units.

Rebuild after a patch: `python3 -m pip install xxhash && python3 guide/build_data.py && python3 guide/build_history.py`
(writes `data.js` and `history.js`; both read the live patch). Page text doesn't mention where data comes from (Nico, 2026-10-16).
Images load from CommunityDragon at view time. `site-tab.json` makes this folder a site tab.

## Augment stages and augment-granted items

`build_data.py` also writes `augment_rules.json` (and `augmentRules` in `data.js`): the four augment levels, cards per
selection and rerolls per slot, the pool size and offer odds per rarity, every live augment's rarity, and
`grantedItems`, the items live augments hand out. `how: "reward"` items can't be bought (leave them out of build
stats); `how: "free"` items are given at once but are also sold. The Info page shows these on the Augment stages
and Items tabs.

## Augment groups by icon

`augment_groups.py` (needs Pillow and numpy) clusters the live augments by how their icon glyph looks. It names each
group after its glyph, from the hand-kept `GLYPHS` map. It then lists what most members share: rarity, build style,
stat or effect words, and the win-rate range. It writes `augment_groups.json`. Run it after `build_data.py`.
