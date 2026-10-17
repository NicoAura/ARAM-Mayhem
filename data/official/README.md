# Official Riot sources (repo only)

Files here keep their source links, so they live outside the published folders. Pages that use them show the content
without naming where it came from.

## patch_notes.json

The ARAM: Mayhem section of every 2026 patch's official patch notes (26.1 to the live patch), read 2026-10-17:
`{read, patches: [{patch, gameVersion, url, date, noMayhemSection, champions: [{name, changes}], augments, items,
systems, bugfixes, aram, intro}]}`, newest first. Change lines are Riot's own ("Damage Dealt: 95% ⇒ 100%"); mid-patch
updates are tagged "(mid-patch update)"; `aram` holds plain-ARAM changes printed in the same notes. 26.2 has only bug
fixes. A few entries were tidied by hand where the page's layout didn't parse (26.3 Augment Sets, 26.12 new and removed
augments). Use it for the Patch Recaps pages and to check `data/wiki/mayhem_modifiers.json`: on 2026-10-17 every
champion stat value the notes set agreed with the wiki table.

Add each new patch's section after its notes go live.
