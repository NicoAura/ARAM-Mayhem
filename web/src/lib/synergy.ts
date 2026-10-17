import "server-only";
import championIds from "@/data/champion-ids.json";
import { champName } from "./highlights";
import { liveWithChange } from "./champions";
import { readRepoJson } from "./repo-data";
import { championTagData, championTags } from "./champion-tags";
import type { TagInfo } from "./tag-info";

// Pair win rates for the Team Builder (/synergy), built once per deploy into /data/synergy.json:
// each champion's 50 best partners (data/cn/champions.json) plus the top duos (data/cn/duos.json).
// Win rates are stored in basis points to keep the file small.

const IDS = championIds as Record<string, number>;
const ALIAS = Object.fromEntries(Object.entries(IDS).map(([alias, id]) => [id, alias]));

type Champs = { champions: { name: string; best_partners?: { champion_id: number; win_rate: number }[] }[] };
type Duos = { duos: { names: string[]; win_rate: number }[] };

export type SynergyData = {
  champions: { id: string; name: string; tier: string; winRate: number; tags: string[] }[];
  tagInfo: TagInfo;
  /** pairs[a][b] = win rate together in basis points, both directions. */
  pairs: Record<string, Record<string, number>>;
};

const bp = (v: number) => Math.round(v * 10000);

export function synergyData(): SynergyData {
  const pairs: SynergyData["pairs"] = {};
  const put = (a: string, b: string, wr: number) => {
    if (!a || !b || a === b) return;
    for (const [x, y] of [
      [a, b],
      [b, a],
    ]) {
      (pairs[x] ??= {})[y] ??= bp(wr);
    }
  };
  for (const d of readRepoJson<Duos>("data/cn/duos.json")?.duos ?? []) put(d.names[0], d.names[1], d.win_rate);
  for (const c of readRepoJson<Champs>("data/cn/champions.json")?.champions ?? [])
    for (const p of c.best_partners ?? []) put(c.name, ALIAS[p.champion_id], p.win_rate);
  const champions = liveWithChange()
    .live.map((c) => ({ id: c.name, name: champName(c.name), tier: c.tier, winRate: c.win_rate, tags: championTags(c.name) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { champions, pairs, tagInfo: championTagData().info };
}
