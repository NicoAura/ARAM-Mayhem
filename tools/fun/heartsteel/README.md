# Heartsteel Quest

How much Health a tank reaches in ARAM Mayhem with Heartsteel, Health items and augments,
including the Steel Your Heart quest. Open `index.html` in a browser; nothing to install.

Each Heartsteel proc deals `70 + 6% max Health` and, in Mayhem, adds 5% of that as permanent
max Health. Health % bonuses (Goliath, Warmog's, Tank Engine, Draw Your Sword, Mad Scientist)
multiply those stacks too, so Health grows by a fixed percent per proc once stacks dominate.
Steel Your Heart triples the stacks once, when they first reach 300.

| File | What it does |
| --- | --- |
| `build_data.py` | Pulls champion base Health, item and augment numbers from CommunityDragon into `data.js` (ARAM/Mayhem overrides applied). Re-run after a patch. |
| `calc.js` | The math, no DOM, usable from Node. |
| `app.js`, `index.html` | The page (styles shared in `../style.css`). |

## Findings (patch 16.20, level 18, 60 procs)

- Trying every combination of 16 tanks, 5 extra items and 4 augments, the most Health is about
  27,000 on Galio with Warmog's, Hollow Radiance, Spirit Visage, Titanic Hydra, Overlord's
  Bloodmail and Goliath, Tank Engine (10 stacks), Celestial Body and Draw Your Sword.
- Steel Your Heart is not in that build. It triples the stacks only once, at 300, which adds
  about 600 Health before multipliers; a permanent Health % augment beats it over a long game.

## Assumptions

- A Heartsteel stack is 1 Health, as the in-game counter shows.
- Health % bonuses add together, then multiply all max Health, Heartsteel stacks included.
- Champion-specific Health stacking (Cho'Gath R, Sion W) goes in the "Other Health" field.
