import "server-only";
import { existsSync } from "node:fs";
import { join } from "node:path";
import championIds from "@/data/champion-ids.json";
import augmentNames from "@/data/augment-names.json";
import { augmentHref } from "./augments";
import { champList } from "./champions";
import { readRepoJson } from "./repo-data";

// Augment Draft practice (/draft): every Mayhem augment with its rarity and live win rate, and how
// often each champion takes each augment (data/cn/builds/<id>.json), to score the practice picks.

const IDS = championIds as Record<string, number>;
const NAMES = augmentNames as Record<string, string>;

export type DraftData = {
  /** id -> [name, rarity, live win rate in basis points or 0, its page or ""] */
  augs: Record<string, [string, string, number, string]>;
  champions: { id: string; name: string }[];
  /** alias -> { augment id: pick rate in basis points } */
  picks: Record<string, Record<string, number>>;
};

export function draftData(): DraftData {
  const rules = readRepoJson<{ tiers?: Record<string, string> }>("guide/augment_rules.json");
  const wr = new Map((readRepoJson<{ augments: { augment_id: number; win_rate: number }[] }>("data/cn/augments.json")?.augments ?? []).map((a) => [String(a.augment_id), a.win_rate]));
  const augs: DraftData["augs"] = {};
  for (const [id, tier] of Object.entries(rules?.tiers ?? {})) {
    if (!NAMES[id] || !existsSync(join(process.cwd(), "public", "icons", "augments", `${id}.webp`))) continue;
    augs[id] = [NAMES[id], tier.toLowerCase(), Math.round((wr.get(id) ?? 0) * 10000), augmentHref(Number(id)) ?? ""];
  }
  const picks: DraftData["picks"] = {};
  for (const [alias, cid] of Object.entries(IDS)) {
    const all = readRepoJson<{ augments?: { all?: { id: number; pick_rate: number }[] } }>(`data/cn/builds/${cid}.json`)?.augments?.all ?? [];
    const mine = Object.fromEntries(all.filter((a) => augs[a.id]).map((a) => [a.id, Math.round(a.pick_rate * 10000)]));
    if (Object.keys(mine).length) picks[alias] = mine;
  }
  return { augs, champions: champList().filter((c) => picks[c.id]), picks };
}
