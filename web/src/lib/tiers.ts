// Champion stats over a chosen set of patches, plus a Bayesian tier for each champion.
//
// Game counts aren't published, so a champion's sample size is estimated from pick rate × days:
// that's proportional to how many games they appear in. Each champion's win rate is then shrunk
// toward the range's average (a beta prior worth PRIOR_STRENGTH "median champions' worth" of games),
// so a rarely picked champion needs a bigger edge to rank high. Tiers are cut by percentile.

import augmentNames from "@/data/augment-names.json";

const AUGS = augmentNames as Record<string, string>;

export type PatchRow = {
  patch: string;
  days: number;
  name: string;
  win_rate: number;
  pick_rate: number;
  damage: number | null;
  tank: number | null;
  kp: number | null;
  dead: number | null;
  /** The champion's most common augment ids that patch, comma separated. */
  augs: string;
};

export type ChampStats = {
  name: string;
  tier: string;
  score: number;
  win_rate: number;
  pick_rate: number;
  damage: number | null;
  tank: number | null;
  kp: number | null;
  dead: number | null;
  patches: number;
  /** Est. share of all games (pick rate × days, normalised to the chosen range). */
  share: number;
  top_augments: string;
};

/** Pseudo-games per champion of median popularity; the prior is worth a quarter of that. */
const MEDIAN_GAMES = 1000;
const PRIOR_STRENGTH = 0.25;

/** Share of champions in each tier, best first. */
export const TIERS: [string, number][] = [
  ["S", 0.08],
  ["A", 0.2],
  ["B", 0.32],
  ["C", 0.25],
  ["D", 0.15],
];

export const TIER_HELP =
  "Tier is a Bayesian estimate: each champion's win rate is pulled toward the average for the chosen patches, " +
  "more strongly the less often they're picked, so a few lucky games can't top the list. " +
  "S is the top 8%, then A 20%, B 32%, C 25% and D 15%.";

const weighted = (pairs: [number | null, number][]) => {
  let sum = 0;
  let w = 0;
  for (const [v, wt] of pairs) {
    if (v === null || !Number.isFinite(v)) continue;
    sum += v * wt;
    w += wt;
  }
  return w > 0 ? sum / w : null;
};

export function champStats(rows: PatchRow[], patches: Set<string>): ChampStats[] {
  const picked = rows.filter((r) => patches.has(r.patch));
  const totalDays = [...new Set(picked.map((r) => `${r.patch}:${r.days}`))].reduce((d, k) => d + Number(k.split(":")[1]), 0);
  const byChamp = new Map<string, PatchRow[]>();
  for (const r of picked) byChamp.set(r.name, [...(byChamp.get(r.name) ?? []), r]);

  const base = [...byChamp].map(([name, rs]) => {
    const w = rs.map((r) => r.pick_rate * r.days);
    const latest = rs.at(-1)!; // rows arrive oldest patch first
    const games = w.reduce((a, b) => a + b, 0);
    return {
      name,
      games,
      win_rate: weighted(rs.map((r, i) => [r.win_rate, w[i]]))!,
      pick_rate: totalDays ? games / totalDays : 0,
      damage: weighted(rs.map((r, i) => [r.damage, w[i]])),
      tank: weighted(rs.map((r, i) => [r.tank, w[i]])),
      kp: weighted(rs.map((r, i) => [r.kp, w[i]])),
      dead: weighted(rs.map((r, i) => [r.dead, w[i]])),
      patches: rs.length,
      top_augments: latest.augs
        .split(",")
        .map((id) => AUGS[id.trim()])
        .filter(Boolean)
        .join(", "),
    };
  });
  if (!base.length) return [];

  const sortedGames = base.map((b) => b.games).sort((a, b) => a - b);
  const median = sortedGames[Math.floor(sortedGames.length / 2)] || 1;
  const mean = weighted(base.map((b) => [b.win_rate, b.games])) ?? 0.5;
  const prior = MEDIAN_GAMES * PRIOR_STRENGTH;
  const allGames = base.reduce((a, b) => a + b.games, 0) || 1;

  const scored = base
    .map((b) => {
      const n = (b.games / median) * MEDIAN_GAMES;
      return { ...b, share: b.games / allGames, score: (b.win_rate * n + mean * prior) / (n + prior) };
    })
    .sort((a, b) => b.score - a.score);

  let cut = 0;
  const bounds = TIERS.map(([t, share]) => [t, (cut += share)] as const);
  return scored.map((b, i) => {
    const pos = (i + 0.5) / scored.length;
    const { games, ...rest } = b;
    void games;
    return { ...rest, tier: bounds.find(([, upTo]) => pos <= upTo)?.[0] ?? "D" };
  });
}
