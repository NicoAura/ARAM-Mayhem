# Augment Odds

Your chance of being offered a specific ARAM Mayhem augment. Pick up to 4 augments you're hunting (any of them
counts), set how many Silver, Gold and Prismatic offers you get in a game and your rerolls, and see the chance per
offer and per game, and how many games it takes for a 50% or 90% chance. "Roll an offer" draws a random offer, and
"Roll until it shows" keeps rolling and counts how many offers it took. Rolled offers are drawn as the game's
augment cards, on the art from the Mayhem augment-selection screen (`game/assets/ux/kiwi/augments/augmentselection/`:
the holo card background, each tier's icon back layer, and the ability frame for ability augments).

From the game files (CommunityDragon): the Mayhem pool (`kiwi.bin.json` AugmentList, minus augments marked
`Enabled: false`) with each augment's tier, 3 cards per offer for every tier, and 1 starting reroll
(`ARAM_Augment_Manager` InitialReroll) from `map12.bin.json`.

Not in the files, so they are assumptions or inputs: offer weights (every augment in a tier is equally likely),
which tier each offer is (inputs, default 1 Silver, 2 Gold, 1 Prismatic), and what a reroll does (treated as a
fresh offer of the same tier). Augments you already took, server-side champion or build filters, and Transmute or
Pandora's Box are not counted.

- `build_art.py` writes `art.js` (the card art as small WebP data URIs; needs Pillow).
- `build_data.py` writes `data.js`; `calc.js` is the math (miss chance per offer = C(n−t, 3) ÷ C(n, 3)); `app.js` is the page.
