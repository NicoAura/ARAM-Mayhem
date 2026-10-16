# Zero Cooldowns

How low any champion's cooldowns go in ARAM Mayhem. Pick a champion (all 173), up to 6 Ability Haste items
and up to 4 Mayhem haste augments, and see total Ability Haste, how much cooldowns are cut, each ability's
cooldown at max rank and casts per minute, plus where every point of haste comes from.

Handled: flat haste, Ultimate Haste (Malignance, Zeke's, Hexplate, Ultimate Awakening, Stuck In Here With Me),
basic-ability haste (Spear of Shojin, Ultimate Awakening's buff), one-key haste (Bread and Butter/Jam/Cheese),
Dashing on abilities you mark as dashes, conversions (Eureka from AP, Crit 'n Cast from crit, Purist - Caster
from attack speed plus its 10% CDR), Infinite Recursion and Shrink Engine stacks, Ult Bot and Back To Basics.
Not counted: cooldown refunds (Archmage, Mystic Punch, Skilled Sniper, Infernal Conduit) and champion-specific
cooldown rules (charges, recasts, passives).

- `build_data.py` pulls cooldowns, items (Mayhem overrides and one-per-group limits) and augments from CommunityDragon into `data.js`.
- `calc.js` is the math (cooldown = base × 100 ÷ (100 + haste)); `app.js` is the page. The build is kept in the URL hash.

The default build is Ezreal with Lucidity, Cosmic Drive, Horizon Focus, Archangel's, Moonstone and Malignance,
plus Recursion, Infinite Recursion, Bread and Butter and Eureka: 450 haste, Q every 0.69 seconds.
