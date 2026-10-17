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

It also lists `selectionAugments` (live augments that add an augment or rerolls, such as King Me) and the
`goldenReroll` reward text.

## Mayhem progression track

`build_track()` reads the newest `kMayhem` season pass from `v1/event-hub.json` (name, dates, level count from its
chapters) and takes that many entries from the end of the Mayhem block in `v1/rewards.json`, which lists every track's
rewards in level order. Each level becomes an augment (matched by icon to kiwi.bin), emote, icon, title or other
reward. `data.js` has the track as `track`; `augment_rules.json` has `unlocks` (augment id to track level) for the
augment pages. If the reward list stops lining up with the track, the track is left out rather than guessed.

## Mode rules (attack speed cap, crits, runes)

`build_data.py` writes `mode_rules.json` for the Simulator and the site:
- `attackSpeedCap`: 1 / `gcd_AttackMinDelay` in the KIWI mode's GameModeConstants (map12.bin); `aramAttackSpeedCap`
  is the same for regular ARAM.
- `critOverflow`: `"adaptive"` when the Mayhemic Magic buff text (`buff_desc_MayhemicMagic`) says excess crit
  chance turns into Adaptive Force. The conversion ratio isn't in the client files.
- `runes`: false when the KIWI constants set `SuppressRunesMasteriesPerks` (no rune page in Mayhem).
- `aura`: the Mayhemic Magic buff's lines. `keystoneAugments`: augment id to the keystones it grants.

The Rules tab shows these, plus a Champion select card (no rune page, keystone augments, summoner spells regular
ARAM allows but Mayhem doesn't). Per-champion damage, healing and shielding adjustments are applied server-side and
aren't in any client file.

## Augment groups by icon

`augment_groups.py` (needs Pillow and numpy) clusters the live augments by how their icon glyph looks. It names each
group after its glyph, from the hand-kept `GLYPHS` map. It then lists what most members share: rarity, build style,
stat or effect words, and the win-rate range. It writes `augment_groups.json`. Run it after `build_data.py`.
