# Mayhem PBE datamine

Scripts that compare PBE against live client data and pull out what affects
ARAM: Mayhem. Results are written up by hand in `data/pbe/`.

Get the data with `get.py`, which reads the installed clients first and falls back to CommunityDragon
when a client is missing, cdtb isn't installed, reading fails, or the local PBE build is behind
(`python3 tools/datamine/get.py /tmp/dm`; it records the source used in `DIR/source.json`).
Or run either source directly. Both write the same layout (`DIR/pbe`, `DIR/latest`):

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
python3 tools/datamine/icons.py /tmp/dm          # add augment icons (and changed-augment tiers) to kiwi-s3.json
```

- `local.py`: reads the WAD archives directly. It finds the clients in the default macOS or
  Windows install folders; pass `--pbe ROOT` / `--live ROOT` otherwise (ROOT holds `Game/`
  and `Plugins/`). Update the PBE client first, since PBE content changes often. A few
  material definitions use a bin type cdtb can't read yet; those entries are skipped and
  the count is printed.
- `jsondiff.py`: structural diff of two bin.json files (also used for kiwi.bin, map12.bin, items).
- `strings.py`: string-table lookup (keys are 38-bit xxh3 hashes of the lowercase key).

For `fetch.py`, the cloud environment needs `raw.communitydragon.org` in its allowed domains.
