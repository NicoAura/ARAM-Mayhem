# Mayhem PBE datamine

Scripts that compare PBE against live client data and pull out what affects
ARAM: Mayhem. Results are written up by hand in `data/pbe/`.

Get the data from one of two sources. Both write the same layout (`DIR/pbe`, `DIR/latest`):

```sh
# From the League clients installed on this computer (live + PBE)
python3 -m pip install cdtb zstandard xxhash
cdtb fetch-hashes                                # once: WAD/bin name lists
python3 tools/datamine/local.py /tmp/dm          # ~170 MB, about a minute

# Or from CommunityDragon
python3 -m pip install xxhash
python3 tools/datamine/fetch.py /tmp/dm          # ~100 MB: PBE + live files
```

Then:

```sh
python3 tools/datamine/augments.py /tmp/dm       # Mayhem augment pool diff
python3 tools/datamine/champions.py /tmp/dm      # champion changes
```

- `local.py`: reads the WAD archives directly. It finds the clients in the default macOS or
  Windows install folders; pass `--pbe ROOT` / `--live ROOT` otherwise (ROOT holds `Game/`
  and `Plugins/`). Update the PBE client first, since PBE content changes often. A few
  material definitions use a bin type cdtb can't read yet; those entries are skipped and
  the count is printed.
- `jsondiff.py`: structural diff of two bin.json files (also used for kiwi.bin, map12.bin, items).
- `strings.py`: string-table lookup (keys are 38-bit xxh3 hashes of the lowercase key).

For `fetch.py`, the cloud environment needs `raw.communitydragon.org` in its allowed domains.
