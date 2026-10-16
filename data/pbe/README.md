# PBE data

Structured PBE changes read from the PBE client files, for the website's PBE section.

- `kiwi-s3.json`: ARAM: Mayhem "Season 3" (codename Kiwi, series `Kiwi_S3`), PBE 16.21 vs live 16.20 as of 2026-10-15. Covers:
  - `fame`: the Fame band track and Superstar Rank
  - `headliners`: the new per-match Headliner system
  - `augments`: added, removed and changed augments
  - `championOverrides`: Mayhem-only champion values
  - `championChanges`, `itemChanges`: regular PBE changes that also apply in Mayhem
  - `modeChanges`: other Mayhem rule and map changes

PBE content can change before release. `meta.notes` lists known gaps in each file.
`description: null` means the augment was found but its tooltip wasn't summarized.

To refresh the data, see `tools/datamine/`.
