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
- **Targets:** every enemy is drawn from a mixed late-game team: squishies (45%, about 3000 HP / 95 armor / 60 MR), bruisers (35%, 4300 / 160 / 95) and tanks (20%, 5800 / 260 / 160), with health varied ±12%. Overkill is wasted. When the target dies she switches to a grouped enemy, or waits for a new one if none is near. `--target HP,AR,MR` swaps in one fixed target instead.
- **Crowd control:** each fight picks how much CC the enemy team brings (0.05 to 0.2 interrupts per second, each 0.75 to 1.75 s). Yunara can't act while interrupted.
- **Enemy damage:** the enemy team starts hitting Yunara 2 to 6 s in, at a damage rate drawn per fight (default 500 ± 200 per second before her armor and MR). Health items, lifesteal and Soul Siphon healing keep her alive longer. If she dies she deals no more damage, and DPS is still averaged over the whole fight, so fragile builds pay for it. The report shows how often she survives and how long she stays alive. `--enemy-dps 0,0` turns this off.
- **Kit:** passive crit magic damage; Q on-hit, stacks, and the active's attack speed, extra on-hit and spread; W impact plus lingering zone, cast time shortening with bonus attack speed; R with Arc of Ruin and E attack resets.
- **Mayhem rules:** Mayhem inherits all regular ARAM balance changes and adds its own on top, so both are applied (Yunara's ARAM damage dealt and taken are both unchanged; BotRK's ARAM on-hit buff is in). Also 200% base crit damage, crit above 100% turning into AD, the 5.0 attack speed cap (10 with full Lethal Tempo) and the 80/70/60 s ultimate.
- **Items and augments:** stat items plus Rageblade Seething and Phantom Hit, BotRK (with its ARAM on-hit override), Kraken, Runaan's, Stormrazor, Atma's Reckoning and Yun Tal Flurry. Augments: Dual Wield, Critical Missile, Soul Siphon, Deft, Upgrade Infinity Edge, Double Tap, Critical Rhythm, Jeweled Gauntlet, Symphony of War, Mystic Punch and Typhoon.

Not modeled: mana, Yunara taking damage, lifesteal, and positioning-dependent augments (Scopiest Weapons, Tap Dancer).

## Augment availability

Each augment in the data file has `offered_to_yunara`. It is `confirmed` when the augment shows up in Yunara's ARAM Mayhem augment stats on current stat sites, which means players actually get offered it on her. Preset builds only use confirmed augments, and `make test` checks that. A custom build that uses an unconfirmed augment (currently Stats on Stats and Goliath) still runs but prints a warning.

## Reproducibility and the website

The simulator core (`src/sim.cpp`) is single-threaded and seeds each trial from `(seed, trial index)` with its own random number generator. Results are identical no matter how trials are split across threads, and the same seed gives the same answer natively and in the browser.

`make wasm` builds a WebAssembly version with Emscripten. The plan for the site is to run one copy per Web Worker, each taking a slice of the trials. That avoids WebAssembly threads, which need COOP/COEP headers that static hosts can't set.
