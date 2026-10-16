# Speed Cap Breaker

How fast any champion can go in ARAM Mayhem. Pick a champion (all 173), up to 6 Move Speed items and
up to 4 Mayhem augments, switch conditional effects on or off, and see raw speed, final speed after the
soft caps, how much the caps ate, seconds to cross the lane and where every point comes from.

Speed = (base + flat bonuses) × (1 + sum of % bonuses) × product of multipliers. Then the soft caps:
above 415 raw speed only 80% of the extra counts, above 490 only 50% (so 490 raw shows as 475). Those
are League's standard caps; no other Move Speed cap turned up in the item, augment or map12 data.

- `build_data.py` pulls base Move Speed and attack range (champion bins), items with Move Speed stats or
  Move Speed passives (Mayhem overrides and one-per-group limits) and every enabled Mayhem augment with a
  Move Speed effect from CommunityDragon into `data.js`. Each source is an effect: flat, % or multiplier,
  with an optional ranged value, value by level, and the toggle or number input it depends on.
- `calc.js` is the math; `app.js` is the page. The build is kept in the URL hash.

## Findings (patch 16.20)

- The fastest build found is Master Yi (355 base) with Swiftmarch, Stridebreaker (5 champions hit),
  Mercurial Scimitar, Youmuu's Ghostblade, Shurelya's Battlesong and Experimental Hexplate, plus Tap Dancer
  (100 stacks), Homeguard, Get Excited! and Rite of Ascension, every active and burst at its peak:
  about 11,300 raw speed, 5,870 after the caps (the caps eat about 5,400).
- Tap Dancer is the engine: 10 flat speed per attack, up to 100 stacks, and flat speed gets multiplied by every % bonus.

## Assumptions and gaps

- Melee or ranged comes from attack range (300 or more counts as ranged) and can be switched by hand. It matters for
  Homeguard, Youmuu's, Hexplate and Crimson Lucidity.
- All % bonuses add together. No Mayhem item or augment is marked as a multiplier in the data, so the
  multiplier only comes from the "Other multiplier" input.
- Decaying effects (Stridebreaker, Escape Plan, Rite of Ascension, En Passant) count at their peak.
- Cosmic Drive's Spelldance uses the tooltip's 20 Move Speed. En Passant's 5% per Vital comes from the tooltip text, since
  it has no data value. Level-scaled augments (It's Go Time, Hellbent, Triggered Inferno) use the level input.
- Left out: champion abilities and passives, runes, slows (and the slow floor), Draw Your Sword's extra bonus for
  long-range champions, Sonata (no number in the data), Swiftmarch's and Gunmetal Greaves' data values that the
  tooltip does not show, and Devil on Your Shoulder (disabled in the data).
- The lane length (10,000 units) is a rough guess, not from the game files. It is an input on the page.
