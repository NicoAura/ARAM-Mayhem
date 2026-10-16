# Yunara ARAM Mayhem DPS simulator

A Monte Carlo simulator for Yunara builds in ARAM Mayhem. Each trial plays out one teamfight with random fight length, crowd control, enemy grouping, crit rolls and W hits, and reports damage per second for each build.

```sh
cd simulator
make run              # build and run every preset build
make test             # sanity checks
./yunara_sim --help   # all options
```

Example custom build:

```sh
./yunara_sim --items berserkers,yuntal,ie,pd,ldr,runaan \
             --augs symphony_of_war,critical_rhythm,upgrade_ie,double_tap \
             --enemy-dps 700,250 --clump 4,0.6
```

`./yunara_sim --list` shows every item, augment and preset build id. `--json` prints machine-readable results for the website.

## Where the numbers live

Every game number is in [`data/yunara_mayhem.json`](data/yunara_mayhem.json): champion stats, ability values, Mayhem rule changes, items, augments, preset builds and the default fight scenario. The C++ only holds mechanics, so a patch update is a data edit.

Each entry has a `confidence`:

- `verified`: two or more current sources agree.
- `likely`: one current source.
- `approx`: an estimate. These are the values to correct from in-game tooltips.

The biggest estimates right now are Yunara's W damage, Q active duration and spread ratio, the R refund on W, the Mayhem augment values (Critical Missile's firecrackers, Symphony of War runes, Critical Rhythm, Typhoon, Deft) and how often Stormrazor charges.

## What a trial models

- **Fight:** length drawn from a normal distribution (default 18 ± 6 s) and 0 to 4 grouped enemies near her target.
- **Enemy team:** each fight draws 5 enemy champions by their China-server ARAM Mayhem pick rate (101.qq.com), from `data/cn_enemy_pool.json`. Each champion has their real level-18 base stats plus an estimated late-game item package for their role, their damage type and Tencent's 1-3 crowd-control rating. Overkill is wasted. When the target dies she switches to a grouped enemy, or waits for a new one if none is near. `--target HP,AR,MR` swaps in one fixed target, and `--enemies archetypes` uses a simple squishy/bruiser/tank mix instead.
- **Crowd control:** the drawn team's CC ratings set how often Yunara gets interrupted (about 0.125 per second on an average team, each 0.75 to 1.75 s). She can't act while interrupted.
- **Enemy damage:** the enemy team starts hitting Yunara 2 to 6 s in. The base rate (500 ± 200 per second for an average player, before armor and MR) is an estimate; it is scaled by Yunara's real share of her team's damage taken in CN games (0.79x the average player) and by how damage-heavy the drawn champions are, and the physical/magic split follows their damage types. Health items, lifesteal and Soul Siphon healing keep her alive longer. If she dies she deals no more damage, and DPS is still averaged over the whole fight, so fragile builds pay for it. The report shows how often she survives and how long she stays alive. `--enemy-dps 0,0` turns this off.
- **Kit:** passive crit magic damage; Q on-hit, stacks, and the active's attack speed, extra on-hit and spread; W impact plus lingering zone, cast time shortening with bonus attack speed; R with Arc of Ruin and E attack resets.
- **Mayhem rules:** Mayhem inherits all regular ARAM balance changes and adds its own on top, so both are applied (Yunara's ARAM damage dealt and taken are both unchanged; BotRK's ARAM on-hit buff is in). Also 200% base crit damage, crit above 100% turning into AD, the 5.0 attack speed cap (10 with full Lethal Tempo) and the 80/70/60 s ultimate.
- **Items and augments:** stat items plus Rageblade Seething and Phantom Hit, BotRK (with its ARAM on-hit override), Kraken, Runaan's, Stormrazor, Atma's Reckoning and Yun Tal Flurry. Augments: Dual Wield, Critical Missile, Soul Siphon, Deft, Upgrade Infinity Edge, Double Tap, Critical Rhythm, Jeweled Gauntlet, Symphony of War, Mystic Punch and Typhoon.

Not modeled: mana, Yunara taking damage, lifesteal, and positioning-dependent augments (Scopiest Weapons, Tap Dancer).

## Enemy pool data

`tools/build_enemy_pool.py` builds `data/cn_enemy_pool.json`. It reads the champion snapshot from `data/cn/fetch_cn.py` (pick rates, damage and damage-taken shares, time dead; fetches the table itself if that file is missing) and adds each champion's base stats, role, damage type and CC rating from Tencent's champion files on game.gtimg.cn. Re-run it to refresh:

```sh
python3 simulator/tools/build_enemy_pool.py
```

The item package per role and the average CC rate are estimates (listed in the pool file's `meta`); everything else comes from the CN data.

## Augment availability

Each augment in the data file has `offered_to_yunara`. It is `confirmed` when the augment shows up in Yunara's ARAM Mayhem augment stats on current stat sites, which means players actually get offered it on her. Preset builds only use confirmed augments, and `make test` checks that. A custom build that uses an unconfirmed augment (currently Stats on Stats and Goliath) still runs but prints a warning.

## Reproducibility and the website

The simulator core (`src/sim.cpp`) is single-threaded and seeds each trial from `(seed, trial index)` with its own random number generator. Results are identical no matter how trials are split across threads, and the same seed gives the same answer natively and in the browser.

`make wasm` builds a WebAssembly version with Emscripten. The plan for the site is to run one copy per Web Worker, each taking a slice of the trials. That avoids WebAssembly threads, which need COOP/COEP headers that static hosts can't set.

# All-champion simulator (`mayhem_sim`)

`mayhem_sim` runs the same kind of teamfight for any of the 173 champions and searches for the item and augment build with the highest damage per second. It shares the Yunara sim's fight model, CN enemy pool and RNG, but each champion's kit is built automatically from game data rather than written by hand, so treat it as an approximation.

```sh
make                          # builds yunara_sim and mayhem_sim
./mayhem_sim --champ Ahri     # best builds for Ahri
./mayhem_sim --champ Jinx --items berserkers,infinity_edge,botrk,lord_dominiks,runaans,seryldas \
             --augs deft,its_critical,mystic_punch,dual_wield
./mayhem_sim --kit Lux        # what the sim read from Lux's abilities
./mayhem_sim --all --json     # every champion (about 2 minutes on 4 cores)
make test                     # both test suites
```

## How a champion is built

`tools/build_champion_pool.py` writes `data/champions.json` from:

- Data Dragon 16.20.1 for base stats and cooldown fallbacks.
- CommunityDragon champion bins for ability values, damage formulas, cooldowns and ammo. Riot's own per-mode values (`DataValuesModeOverride`, ARAM then Kiwi = Mayhem) are applied on top.
- The CommunityDragon string table for ability tooltips. Damage tags (`<magicDamage>`, `<physicalDamage>`, `<trueDamage>`) say which formulas deal damage and of what type. Heals, shields and minion or monster damage are skipped.
- aramnerfs.com/mayhem for the Mayhem balance table (damage dealt and taken, ability haste, attack speed, cooldown changes). It lists absolute Mayhem values, so they replace the regular ARAM ones.
- `data/cn/champions.json` (101.qq.com) for role, damage share and damage taken.

Each champion gets a `parse_quality` of good, partial or none (currently 138 / 32 / 3). Abilities the parser gets wrong are fixed in `data/champion_overrides.json`, each with a reason. To rebuild: `python3 tools/build_champion_pool.py` and `python3 tools/build_items.py` (downloads are cached in `~/.cache/aram-mayhem-sim`).

## Items and augments

`data/item_effects.json` is hand-written: which items exist, which roles they suit, and their passives as effect keys. `tools/build_items.py` adds each item's stats from Data Dragon and writes `data/items.json`. Item passive values are tooltip values as best known and should be checked in game. Effect keys:

| Key | Meaning |
|---|---|
| `attack_cdr_pct` | basic abilities' cooldowns drop by this share on each attack |
| `bolts`, `bolts_ad` | extra bolts per attack at this share of AD |
| `execute` | kills targets under this share of max HP |
| `spellblade_*` | next attack after a cast deals base/bonus AD or AP; `spellblade_cd` |
| `storm_every`, `storm_magic` | magic damage every Nth attack |
| `onhit_cur_hp`, `onhit_own_hp`, `onhit_magic(_ap)` | on-hit damage |
| `kraken_*`, `phantom_every` | every-Nth-attack procs |
| `armor_shred`, `cleave_ad` | armor reduction, splash damage |
| `ability_amp`, `ap_amp`, `damage_amp` | damage or AP multipliers |
| `maxhp_proc(_cd)` | max-HP damage proc with a cooldown |
| `burn_*` | damage over time after an ability hits |
| `proc_*`, `active_*` | Luden's-style procs and active items |
| `aura_flat`, `aura_bonus_hp` | Sunfire-style aura damage per second |

`data/augments.json` has 13 Mayhem augments with Riot's Kiwi ids and Arena level-1 values. Some (Erosion, Tank Engine) are approximations.

## Optimizer

Boots, five legendaries and four augments. Items are searched greedily to pick about 14 candidates, then every five-item combination is screened on a few fights, then augments are added greedily, and the finalists are re-run on 2000 fights. Every build sees the same fights (common random numbers). Only items whose roles fit the champion's class and ability scalings are searched; `--any-items` lifts that. The objective is mean DPS over the whole fight, so dying early counts against a build. Settings live in `data/mayhem_rules.json`.

## Limits

- Passives, stacking and HP-scaling kits are mostly missing, so fighters and juggernauts (Sett, Sion, Mundo, Mordekaiser, Gwen, Diana) are underrated.
- Supports are compared on damage builds, and tanks build glassy because only damage is optimized.
- Across all champions, simulated DPS correlates only weakly with real CN damage share (Spearman 0.17). Use it to compare builds for one champion, not to rank champions.
- Mystic Punch is picked very often; its value may be too generous.
- For Yunara, `yunara_sim` is the better model.

## Fight replays

`viewer/` animates one simulated fight per champion: you, the enemy you are hitting and the rest of their team, with every cast, attack, damage number, kill and stun drawn as it happens. Every fighter is the champion's animated 3D model (three.js), posed from the simulated timeline: each cast plays that ability's animation, attacks and crits play theirs, and stuns and deaths show too. Clicking an ability, or pressing Q/W/E/R, makes your champion cast it. Enemies open with their recommended combo when they engage and then keep casting their Q, W and E in that order (R once), with the ability's icon above them; each stun on you is shown as an enemy's ability landing. The simulator models enemy damage as a steady rate, so enemy casts are for show and don't change the numbers. A missing animation falls back to the basic attack (Garen has no separate W, for example). Champions without a model fall back to Riot's ability preview clips.

```sh
make replay                          # traces for all champions + icons; clips stream from Riot
make replay CLIPS=--clips            # also store shrunk clips locally (about 50 MB, needs ffmpeg)
make replay MODELS=1                 # also build the 3D models (about 130 MB, needs Node; see below)
cd viewer && python3 -m http.server  # then open http://localhost:8000/#Ahri
./mayhem_sim --champ Jinx --trace jinx.json   # one champion's trace
```

The replay shown is the median-DPS fight out of the first 200 for the best build, so it is a typical fight rather than a lucky one. `--trace` records the same fight the simulator scores (recording never changes the random draws; `make test` checks this). In `viewer/replay-data/`, the simulator's own output is committed so the website can show it: `index.json`, `traces.json`, `best-builds.json` and the WebAssembly engine. The icon atlas, clips and built models are not, because they belong to Riot Games. Without them the viewer loads each icon from Data Dragon and each model straight from modelviewer.lol (the full file, about 17 MB per champion, picking its clips in the browser), so the website works without any Riot files in the repo. After changing the viewer or its data, bump `REPLAY_VERSION` and the `?v=` tags in `viewer/index.html` so browsers fetch the new files.

**Sounds.** With the models, each cast plays that ability's sound, yours at full volume and the enemies' quieter; the Sound button turns them off, and browsers only allow sound after the first click or key press. `tools/build_sounds.py` (run by `make replay`) finds the first burst of sound in each of Riot's ability preview videos and stores where it starts and how long it lasts in `index.json`, and the page streams that stretch from Riot's CDN. `make replay SOUNDS=1` also joins them into one `viewer/replay-data/sounds/sounds.mp3` (about 10 MB, not committed) for sandboxed pages such as the claude.ai preview.

**Models.** `tools/build_models.mjs` keeps the animations the replay uses (idle, attack, crit, Q, W, E, R, stunned, death and the extras below), shrinks textures to 512 px WebP and compresses meshes with meshopt, about 0.4 to 1.7 MB per champion. For now it downloads the exports from modelviewer.lol; they are meant to be replaced with models exported from a local League install. `viewer/clips.js` picks the clips (shared by the builder and the viewer): besides the main ones it keeps one idle variation, up to two more versions of each ability (Yasuo's and Riven's Q swings) and the clip that eases each ability back to idle. The viewer plays idle twice and then the variation, gives the n-th cast of an ability the n-th version, blends 0.15 s between clips, and shows each cast's whole animation (up to 2.5 s). It hides the parts the game hides (Teemo's mushroom, Ornn's poro) using the visibility data in those files. Abilities keep their sideways root motion, so dashes and leaps carry the model (at most 1.6 champion heights) before it glides back to its spot; other clips stay in place.

### Combos

Every champion casts in its recommended combat combo (`data/combos.json`, e.g. Ahri `EQRW`): when several abilities are ready, the one earliest in the combo goes first. The combos are written by hand from common guide combos, so they are approximate. `--combo RWQE` (or the page's Combo field) changes yours; `--set combo_order=0` goes back to strongest ability first.

### Changing the simulation in the page

Under the replay, **Change the simulation** edits the build (boots, five items, four augments), the enemies and the fight settings, then re-runs the simulator in the browser (`make wasm-mayhem`, run in a Web Worker) and replays a typical fight with the new setup. Enemies default to the China-server mix; you can instead pick five champions and change each one's HP, armor, MR and share of their team's damage, or fight training dummies. The same settings work on the command line:

```sh
./mayhem_sim --list --json                       # every setting with its default and the enemy pool
./mayhem_sim --champ Yunara --set level=13,enemy_damage_scale=1.5 \
             --team "Malphite:hp=6000:armor=300,Brand,Sivir,Nami,Trundle"
```
