# Mayhem PBE datamine

Scripts that compare PBE against live client data from CommunityDragon and pull out
what affects ARAM: Mayhem. Results are written up by hand in `data/pbe/`.

```sh
python3 -m pip install xxhash
python3 tools/datamine/fetch.py /tmp/dm          # ~100 MB: PBE + live files
python3 tools/datamine/augments.py /tmp/dm       # Mayhem augment pool diff
python3 tools/datamine/champions.py /tmp/dm      # champion changes
```

- `jsondiff.py`: structural diff of two bin.json files (also used for kiwi.bin, map12.bin, items).
- `strings.py`: string-table lookup (keys are 38-bit xxh3 hashes of the lowercase key).

The cloud environment needs `raw.communitydragon.org` in its allowed domains.
