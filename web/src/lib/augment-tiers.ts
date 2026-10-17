import "server-only";
import { readFileSync } from "node:fs";
import { augmentPages } from "./augments";
import { repoHas, repoPath, readRepoJson } from "./repo-data";
import { TIERS } from "./tiers";

// Augment tier list (/augments): every live augment ranked S to D against the others of its rarity
// (a selection only ever offers one rarity), plus the build styles it fits, for the style filter.
//
// Tiers use the same idea as champion tiers: win rate is pulled toward the rarity's average, more
// strongly the less often the augment is picked, then cut by percentile.
//
// Styles: an augment fits a style when champions who play that style list it among that style's
// augments (champions/data.js "Builds by style"), or when its internal name names the style.

export const STYLES = {
  crit: "Crit",
  onhit: "On-hit",
  ap: "AP",
  lethality: "Lethality",
  fighter: "AD",
  tank: "Tank",
  enchanter: "Enchanter",
} as const;
export type Style = keyof typeof STYLES;

// Internal-name patterns, as in champions/build_data.py.
const NAME_STYLE: Record<Style, RegExp> = {
  crit: /crit/,
  onhit: /onhit|attackspeed|dualwield|deft/,
  ap: /abilitypower|magic|witch|warlock|mage/,
  lethality: /lethality|armorpen|assassin|execute/,
  fighter: /omnivamp|lifesteal|vamp|fighter|juggernaut/,
  tank: /health|armor|resist|tank|maxhp|colossus/,
  enchanter: /heal|shield|ally|allies|support/,
};

export type TierAug = {
  id: number;
  name: string;
  href: string;
  rarity: "silver" | "gold" | "prismatic";
  tier: string;
  winRate: number;
  pickRate: number;
  styles: Style[];
};

type Raw = { augment_id: number; key?: string; tier?: string; pick_rate: number; win_rate: number };
type ChampsData = { champions: { builds?: { styles?: { style: string; augments?: number[] }[] } }[] };

const PRIOR = 0.25; // the average's weight, in "median augments' worth" of picks

function styleVotes(): Map<number, Record<string, number>> {
  const out = new Map<number, Record<string, number>>();
  if (!repoHas("champions/data.js")) return out;
  const js = readFileSync(repoPath("champions/data.js"), "utf8");
  const data = JSON.parse(js.slice(js.indexOf("{"), js.lastIndexOf("}") + 1)) as ChampsData;
  for (const c of data.champions)
    for (const s of c.builds?.styles ?? [])
      for (const id of s.augments ?? []) {
        const v = out.get(id) ?? {};
        v[s.style] = (v[s.style] ?? 0) + 1;
        out.set(id, v);
      }
  return out;
}

let cache: TierAug[] | null = null;
export function augmentTiers(): TierAug[] {
  if (cache) return cache;
  const raw = new Map((readRepoJson<{ augments: Raw[] }>("data/cn/augments.json")?.augments ?? []).map((a) => [a.augment_id, a]));
  const votes = styleVotes();
  const pages = augmentPages();
  const out: TierAug[] = [];
  for (const rarity of ["silver", "gold", "prismatic"] as const) {
    const group = pages.filter((a) => a.tier === rarity);
    if (!group.length) continue;
    const picks = group.map((a) => a.pickRate).sort((x, y) => x - y);
    const median = picks[Math.floor(picks.length / 2)] || 1;
    const total = group.reduce((s, a) => s + a.pickRate, 0) || 1;
    const mean = group.reduce((s, a) => s + a.winRate * a.pickRate, 0) / total;
    const scored = group
      .map((a) => {
        const n = a.pickRate / median;
        return { a, score: (a.winRate * n + mean * PRIOR) / (n + PRIOR) };
      })
      .sort((x, y) => y.score - x.score);
    let cut = 0;
    const bounds = TIERS.map(([t, share]) => [t, (cut += share)] as const);
    scored.forEach(({ a }, i) => {
      const pos = (i + 0.5) / scored.length;
      const key = (raw.get(a.id)?.key ?? "").replace(/^ARAM_/, "").toLowerCase();
      const v = votes.get(a.id) ?? {};
      const seen = Object.values(v).reduce((s, n) => s + n, 0);
      const styles = (Object.keys(STYLES) as Style[]).filter((s) => (v[s] ?? 0) >= Math.max(2, seen * 0.25) || NAME_STYLE[s].test(key));
      out.push({
        id: a.id,
        name: a.name,
        href: `/augments/${a.slug}`,
        rarity,
        tier: bounds.find(([, upTo]) => pos <= upTo)?.[0] ?? "D",
        winRate: a.winRate,
        pickRate: a.pickRate,
        // An augment that fits nearly every style says nothing about any of them.
        styles: styles.length <= 3 ? styles : [],
      });
    });
  }
  cache = out;
  return out;
}
