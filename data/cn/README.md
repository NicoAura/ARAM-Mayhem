# China-server Mayhem stats

`fetch_cn.py` pulls ARAM Mayhem (海克斯大乱斗) stats for the Chinese servers from the
backend behind Tencent's official strategy site, [101.qq.com](https://101.qq.com/).
No login is needed. Python 3 standard library only.

```
python3 data/cn/fetch_cn.py            # newest day
python3 data/cn/fetch_cn.py --date 20261014
```

| File | What it holds |
| --- | --- |
| `champions.json` / `.csv` | Per champion: rank, win rate, pick rate, rank change, damage/tank share, kill participation, avg time dead, best partners |
| `augments.json` / `.csv` | Per augment: win rate, pick rate, ranks, tier, best champions |
| `duos.json` | Top 2,000 champion pairs by win rate and pick rate |
| `raw/` (git-ignored) | Untouched API responses |

Endpoints (all on `https://mlol.qt.qq.com/go/battle_info/odp_proxy/`):

- `fuwen_aram_hero_rank_v2?dtstatdate=YYYYMMDD` champions (daily; yesterday is newest)
- `fuwen_aram_rune_rank_v2?augmentid_level=255` augments
- `fuwen_aram_hero_parttner?role1=255&role2=255&championid=255` duos

Names come from `game.gtimg.cn` (`hero_list.js`, `kiwi/kiwi_augments.json`).

Caveats: the API is undocumented and can change without notice. Rates are fractions
(0.5575 = 55.75%). The champion `rank` is Tencent's own ordering, not sorted by win
rate. Sample sizes are not published.
