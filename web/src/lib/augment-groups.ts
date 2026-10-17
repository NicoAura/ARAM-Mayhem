import "server-only";
import { readRepoJson } from "./repo-data";
import { augmentTiers, type TierAug } from "./augment-tiers";

// Augments grouped by the symbol on their icon (a spell bolt, a shield, a loot bag…), with what most of
// each group has in common: rarity, build style, the stats or effects their text mentions, and how they
// win. Data: guide/augment_groups.json; members are graded with the tier list (lib/augment-tiers.ts).

type Raw = {
  groups: {
    name: string;
    augments: { id: number }[];
    common: { rarity: string[]; styles: string[]; words: { word: string; share: number }[]; winRate: { min: number; max: number; avg: number } };
  }[];
};

export type AugmentGroup = {
  name: string;
  members: TierAug[];
  rarity: string[];
  styles: string[];
  words: { word: string; share: number }[];
  winRate: { min: number; max: number; avg: number };
  /** The members' average DeepScore. */
  deepScore: number;
};

export function augmentGroups(): AugmentGroup[] {
  const raw = readRepoJson<Raw>("guide/augment_groups.json");
  if (!raw) return [];
  const graded = new Map(augmentTiers().map((a) => [a.id, a]));
  return raw.groups
    .map((g) => {
      const members = g.augments.map((a) => graded.get(a.id)).filter((a): a is TierAug => Boolean(a)).sort((a, b) => b.deepScore - a.deepScore);
      return {
        name: g.name,
        members,
        rarity: g.common.rarity,
        styles: g.common.styles,
        words: g.common.words,
        winRate: g.common.winRate,
        deepScore: members.length ? Math.round(members.reduce((s, a) => s + a.deepScore, 0) / members.length) : 0,
      };
    })
    .filter((g) => g.members.length);
}
