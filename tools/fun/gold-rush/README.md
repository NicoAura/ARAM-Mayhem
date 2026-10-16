# Gold Rush

How fast you finish a full build in ARAM Mayhem. Pick up to 6 items (boots allowed) in the order you
buy them and up to 4 Mayhem augments that give gold, set your kills, assists and last hits, and see the
minute each item is done, the full build time, total gold by 10, 20 and 30 minutes, a chart of gold
over time with a mark at each item, and how many minutes the gold augments save.

| File | What it does |
| --- | --- |
| `build_data.py` | Pulls Mayhem's income numbers, the Mayhem shop's legendary items and boots, and the gold augments from CommunityDragon into `data.js`. Re-run after a patch. |
| `calc.js` | The math, no DOM, usable from Node. |
| `app.js`, `index.html` | The page (styles shared in `../style.css`). The build is kept in the URL hash. |

## Model

The game runs one second at a time. You start with Mayhem's starting gold. From the passive gold
start time you earn passive gold plus kills × kill gold + assists × assist gold + last hits × minion
gold, all as steady rates. Items are bought in order, and each one is done the moment your saved gold
covers its full price. The same game runs again without the augments, and the gap between the two
full build times is the time saved.

Gold augments:

- Goldrend: 10 gold × 3 loops = 30 gold per champion hit, once per champion every 30 seconds (max 5 champions).
- Combusting Interest: 1 to 3 gold (by level, 2 used) per burn tick plus 0.75% of burn damage.
- Yowch, My Coins!: 15 gold per coin you grab, per takedown (6 to 10 coins drop).
- From Beginning To End: First Strike pays 20 gold plus 60% (42% ranged) of its 10% bonus damage, at most once per 15 seconds.
- Donation: 1,750 gold once.
- Upgrade augments (Immolate, Collector, Infinity Edge, Sheen, Death's Dance, Sundered Sky, Ravenous Hydra):
  their one-off gold, plus Immolate's 12 gold per target tick and Collector's 50 per execute. They pay
  only once you own their item, since that is when Mayhem offers them.
- Wooglet's Witchcap and Icathia's Fall quests: the free Needlessly Large Rod (1,200) or Bami's Cinder
  (900) comes off the next item in your order that is built from it.

Each augment has a "taken at minute" input (default 0).

## Data (patch 16.20)

From `map12.bin.json`, Kiwi mode: starting gold 1,400, passive gold 42.5 every 5 seconds from 1:00,
kill gold 200 (first blood +90, not modeled). Minion gold from the Howling Abyss minion files: melee
20, caster 17 (default 18.5 per last hit). Not found in a readable form: assist gold, so it is an input
with a best-guess default of 35.

## Preset

Plated Steelcaps, Sunfire Aegis, Warmog's Armor, Thornmail, Spirit Visage and Jak'Sho with Goldrend,
From Beginning To End, Donation and Upgrade Immolate, all taken at the start: full build at 10:27
instead of 21:04, so the augments save about 10.6 minutes. This was the fastest of 1,001 augment
combinations tried on five common builds with default inputs.

## Left out

First blood, kill streak bounties, minion gold growth over time, gold from nearby minion deaths,
stat anvils, selling items and buying components early.
