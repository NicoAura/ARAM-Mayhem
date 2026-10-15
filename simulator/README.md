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
             --target 4200,150,90 --clump 4,0.6
```

`./yunara_sim --list` shows every item, augment and preset build id. `--json` prints machine-readable results for the website.

## Where the numbers live

Every game number is in [`data/yunara_mayhem.json`](data/yunara_mayhem.json): champion stats, ability values, Mayhem rule changes, items, augments, preset builds and the default fight scenario. The C++ only holds mechanics, so a patch update is a data edit.

Each entry has a `confidence`:

- `verified`: two or more current sources agree.
- `likely`: one current source.
- `approx`: an estimate. These are the values to correct from in-game tooltips.

The biggest estimates right now are Yunara's W damage, Q active duration and spread ratio, the R refund on W, the Mayhem augment values (Symphony of War runes, Critical Rhythm, Typhoon, Stats on Stats anvils) and how often Stormrazor charges.

## What a trial models

- **Fight:** length drawn from a normal distribution (default 18 ± 6 s), random interrupts during which Yunara can't act, and 0 to 4 grouped enemies near her target.
- **Targets:** each enemy has the scenario's HP, armor and MR. Overkill is wasted. When the target dies she switches to a grouped enemy, or waits for a new one if none is near.
- **Kit:** passive crit magic damage; Q on-hit, stacks, and the active's attack speed, extra on-hit and spread; W impact plus lingering zone, cast time shortening with bonus attack speed; R with Arc of Ruin and E attack resets.
- **Mayhem rules:** 200% base crit damage, crit above 100% turning into AD, the 5.0 attack speed cap (10 with full Lethal Tempo) and the 80/70/60 s ultimate.
- **Items and augments:** stat items plus Rageblade Seething and Phantom Hit, BotRK, Kraken, Runaan's, Stormrazor, Atma's Reckoning, Yun Tal Flurry, and the augments Symphony of War, Critical Rhythm, Double Tap, Jeweled Gauntlet, Mystic Punch, Typhoon, Upgrade Infinity Edge and Stats on Stats (anvils rolled fresh each trial).

Not modeled: mana, Yunara taking damage, lifesteal, and positioning-dependent augments.

## Reproducibility and the website

The simulator core (`src/sim.cpp`) is single-threaded and seeds each trial from `(seed, trial index)` with its own random number generator. Results are identical no matter how trials are split across threads, and the same seed gives the same answer natively and in the browser.

`make wasm` builds a WebAssembly version with Emscripten. The plan for the site is to run one copy per Web Worker, each taking a slice of the trials. That avoids WebAssembly threads, which need COOP/COEP headers that static hosts can't set.
