# Tests

Run on every pull request by `.github/workflows/tests.yml` (the **Tests** check). Merge only when it is green.

| What | Where | Run locally |
| --- | --- | --- |
| Website unit tests (tiers, account, settings, sanitizers, site data loaders, rate limit) | `web/tests/unit/` | `cd web && npm test` |
| Website pages at desktop and phone sizes (loads, no script errors, no broken files, no sideways scroll, redirects, fixed-bug regressions) | `web/tests/e2e/` | `cd web && npm run build && npm run test:e2e` |
| Simulator engine sanity checks | `simulator/tests/` | `make -C simulator test` |
| Simulator pinned results, JSON the site reads, data integrity, bad input | `tests/simulator/` | `python3 -m pytest tests/simulator` |
| Data builders, shipped pages, self-hosted assets, My Stats import | `tests/data/` | `python3 -m pytest tests/data` |

Tests never touch the network or the League client.

## When a test fails on purpose

- **Simulator numbers changed deliberately** (a tuning or patch update): re-pin with
  `UPDATE_SNAPSHOTS=1 python3 -m pytest tests/simulator/test_sim_snapshots.py` and commit `tests/simulator/snapshots.json` with the change.
- **A known bug**: tests marked `xfail(strict=True)` describe bugs that are still open. When the bug is fixed the test
  starts passing and fails as "XPASS"; remove the `xfail` mark in the same PR.
