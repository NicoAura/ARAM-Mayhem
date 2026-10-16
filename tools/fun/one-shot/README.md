# One-Shot Checker

Does your burst kill a target from full Health in ARAM Mayhem? Enter the burst as raw physical, magic
and true damage, pick up to 6 penetration or damage items and up to 4 Mayhem augments, then pick any
target champion (all 173), their level and a target build. The page shows the damage of each type after
resists, the total, the % of max Health, and either KILL or the Health left plus how much more raw damage
of each type would finish the job.

## Model

- Target stats: `base + growth × (n - 1) × (0.7025 + 0.0175 × (n - 1))` from each champion's character record,
  plus the target build's bonus Health, Armor and Magic Resist.
- Resists: % reduction (Black Cleaver, Erosion), then % penetration (multiplicative), then flat penetration and
  Lethality. Reduction and penetration only cut positive resists.
- Damage taken: `damage × 100 / (100 + resist)`, or `× (2 - 100 / (100 - resist))` when resist is negative.
- Damage bonuses multiply together. Abyssal Mask only boosts magic damage; Back To Basics, Overflow and
  Spear of Shojin only count when the burst is ability damage. Glass Cannon and Devil on Your Shoulder add a
  share of the damage that lands as true damage. Bastionbreaker adds one Shaped Charge (50 + 1.5 × Lethality
  true damage, half for ranged).
- Executes: The Collector (5%) and Dropkick (typed threshold); the highest one counts.

| File | What it does |
| --- | --- |
| `build_data.py` | Pulls champion stats, item penetration stats and data values (ARAM/Mayhem overrides, one-per-group limits) and augment values from CommunityDragon into `data.js`. Re-run after a patch. |
| `calc.js` | The math, no DOM, usable from Node. |
| `app.js`, `index.html` | The page (styles shared in `../style.css`). The build is kept in the URL hash. |

## Target builds

"No items" adds nothing, "Squishy" adds 800 Health, "Bruiser" 1,600 Health, 70 Armor and 50 Magic Resist,
"Tank" 2,800 Health, 160 Armor and 120 Magic Resist. These are plain numbers we picked, editable on the page.

## Preset (patch 16.20)

A 3,200 physical damage combo with Youmuu's, Bastionbreaker, Hubris, Serylda's, The Collector and Edge of Night,
plus Thread the Needle, Erosion, Glass Cannon and Giant Slayer, into a level 18 Sion with the Tank build
(4,934 Health, 267 Armor). Armor drops to 17 and the burst deals 4,737, past The Collector's 5% execute line:
a kill. Without the augments the same burst deals 38% of his Health.

## Not in the data or not modeled

- Dropkick's execute grows with your stats, but the stat behind one ratio is not clear from the files, so the
  page takes a typed threshold (4% flat part from the data as default).
- Glass Cannon and Devil on Your Shoulder are read as "this share of damage dealt, as extra true damage".
  Devil on Your Shoulder uses its base 20%.
- Horizon Focus still has a 10% DamageAmp value in the files, but its tooltip no longer mentions it, so it is left out.
- ARAM per-champion damage adjustments, shields, healing, damage reduction, Shadowflame's low-Health crits,
  Stormsurge's delayed Squall and on-hit effects are not counted.
