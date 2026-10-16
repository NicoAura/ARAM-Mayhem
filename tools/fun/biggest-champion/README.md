# Biggest Champion

How big any champion can get in ARAM Mayhem. Pick a champion (all 173), the size items and up to 4 Mayhem
size augments, set ranks and stacks, and see the final size, how it compares with Baron Nashor, a to-scale
drawing of both, and where every percent comes from. Open `index.html` in a browser; nothing to install.

| File | What it does |
| --- | --- |
| `build_data.py` | Pulls selection radii, Baron's record, size items, size augments and champion size abilities from CommunityDragon into `data.js`. Re-run after a patch. |
| `calc.js` | The math, no DOM, usable from Node. |
| `app.js`, `index.html` | The page (styles shared in `../style.css`). The build is kept in the URL hash. |

## Model

- Base size is the character record's `selectionRadius` (100 to 150 for champions, 180 for `SRU_Baron`). It follows
  the visible model more closely than `overrideGameplayCollisionRadius`, which only has a few steps (55, 65 default, 80).
- size = 1 + sum of all bonuses, never below 20% (Shrink Engine's `MinSize`). Bonuses are added, not multiplied:
  the game lists each as its own percent and Heartsteel's 30% `SizeCap` only makes sense for a summed stat.
- Radius = selection radius × size. "% of Baron" = radius ÷ 180.

Sources: Goliath (+50%), Mad Scientist large form (+40%), Tank Engine (+5% per stack), Growth Spurt (+50% for 7 s),
Dimension Shift (+35% in the other Realm), Titan's Resolve (+10% per Juggernauting level, max 2), Shrink Engine
(−4% per stack), Giant Slayer (−25%, read from `SizeMod`), Heartsteel (+3% per 1000 max Health, up to 30%),
Protoplasm Harness (+15%) and Sterak's Gage (+10%) during Lifeline, Nasus R (30/35/40%), Bel'Veth R (5/13/21%),
Shyvana R (5/12.5/20%), Trundle R (2%).

## Findings (patch 16.20)

The biggest build is Nasus with R at rank 3, Heartsteel at 10,000 Health and Protoplasm Harness, plus Goliath,
Growth Spurt, Tank Engine (10 stacks) and Mad Scientist: 375% size, a radius of 506, 281% of Baron Nashor.
Aurelion Sol, with the largest base radius (150), comes second at 502 with the same items and augments.
More Tank Engine stacks keep growing it with no cap in the data.

## Not in the data

- Cho'Gath's Feast has Health and range per stack but no size per stack, so the page asks for your own value.
- Volibear R, Zac, Sion, Kled and Malphite have no size value in their spell data and are left out.
- Mad Scientist's tiny form has no size value, so it counts as 0.
- Gargoyle Stoneplate (+25%) is not in the store. Cappa Juice has a size value but its tooltip says it does nothing.
- Escape Plan's short shrink has no number for how small, so it is left out.
