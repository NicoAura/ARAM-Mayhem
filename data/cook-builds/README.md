# The Kitchen (cook builds)

Troll builds for ARAM Mayhem built on strange augment interactions (a hook that applies
on-hit effects, an artillery mage gone melee, champions who swap their range), each checked
against Mayhem win rates and the all-champion damage simulator. The folder
is a website tab through `site-tab.json`.

| File | What it is |
| --- | --- |
| `builds.json` | The builds, written by hand: champion, title, augments, items, why it's funny, how to play |
| `build_data.py` | Adds augment text and icons, Mayhem stats and simulator numbers, and writes `data.js` |
| `data.js`, `icons/` | Generated; committed so the page works as static files |
| `index.html`, `app.js`, `style.css` | The page (site minimal theme) |
| `build_preview.py` | Packs the page into one HTML file for previews |

## Rebuilding

```sh
python3 -m pip install xxhash
python3 data/cn/fetch_cn.py                  # Mayhem stats (data/cn/, PR #5)
make -C simulator mayhem_sim                 # optional (simulator/, PR #4)
python3 data/cook-builds/build_data.py --cn data/cn --sim simulator/mayhem_sim
```

Leave out `--sim` to skip the simulator numbers. Augment names, tooltips and icons come from
the live client's Mayhem (KIWI) augment pool on CommunityDragon.

## How a build is scored

- **Tier** is the average Mayhem win rate of the build's core augments (the first `core`
  entries in `augments`; the rest are flex picks): Secretly strong at 55.5% or more, Holds up
  from 51.5%, Pure troll below that. Augment win rates aren't published per champion.
- **Best on** marks augments where the champion is on the best-champion list.
- **Simulator** runs the build's items against the simulator's own top build for that
  champion, both with the top build's augments, since most cook augments (death explosions,
  polymorphs, snowballs) aren't in the simulator. Support items aren't modeled, so supports
  get no simulator number.

## Adding a build

Add an entry to `builds.json` with augment names exactly as the client spells them and item
names as the simulator spells them (`./mayhem_sim --list`), then rerun `build_data.py`.
