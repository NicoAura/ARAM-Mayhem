import "server-only";
import championIds from "@/data/champion-ids.json";
import augmentNames from "@/data/augment-names.json";
import { liveWithChange } from "./champions";
import { champName } from "./highlights";
import { item, rewardItems } from "./items";
import { readRepoJson } from "./repo-data";
import { championTagData, championTags } from "./champion-tags";

// Everything the champion compare page (/compare) lines up side by side, built once per deploy into
// /data/compare.json: live-patch stats, most picked augments and core items, skill order, and the
// simulator's damage for its best build.

const IDS = championIds as Record<string, number>;
const ALIAS = Object.fromEntries(Object.entries(IDS).map(([alias, id]) => [id, alias]));
const AUGS = augmentNames as Record<string, string>;

type Builds = {
  augments?: { all?: { id: number; pick_rate: number }[] };
  skills?: { max_order: string[]; pick_rate: number }[];
  items?: { core?: { items: number[]; pick_rate: number; win_rate: number }[] };
  partners?: { id: number; win_rate: number }[];
};
type Best = {
  champions: {
    champion: string;
    build: { items: string[]; augments: string[] };
    summary: { mean_dps: number; survival_rate: number; kills_per_minute: number };
  }[];
};
type SimDb = Record<string, { id: number; name: string }>;

export type CompareChampion = {
  id: string;
  name: string;
  tier: string | null;
  rank: number | null;
  winRate: number | null;
  pickRate: number | null;
  change: number | null;
  damage: number | null;
  tank: number | null;
  kp: number | null;
  dead: number | null;
  augments: number[];
  core: { items: number[]; winRate: number } | null;
  skills: string[];
  partners: string[];
  sim: { dps: number; survival: number; kpm: number; items: number[]; augments: number[] } | null;
  tags: string[];
};

export function compareData() {
  const { live, patch } = liveWithChange();
  const stats = new Map(live.map((c) => [c.name, c]));
  const best = new Map((readRepoJson<Best>("simulator/viewer/replay-data/best-builds.json")?.champions ?? []).map((c) => [c.champion, c]));
  const simItems = readRepoJson<{ items: SimDb }>("simulator/data/items.json")?.items ?? {};
  const simAugs = readRepoJson<{ augments: SimDb }>("simulator/data/augments.json")?.augments ?? {};
  const usedItems = new Set<number>();
  const champions: CompareChampion[] = Object.keys(IDS).map((alias) => {
    const s = stats.get(alias);
    const b = readRepoJson<Builds>(`data/cn/builds/${IDS[alias]}.json`);
    const core = b?.items?.core?.[0];
    const sim = best.get(alias);
    const simItemIds = (sim?.build.items ?? []).map((k) => simItems[k]?.id).filter((v): v is number => Boolean(v));
    for (const id of [...(core?.items ?? []), ...simItemIds]) usedItems.add(id);
    return {
      id: alias,
      name: champName(alias),
      tier: s?.tier ?? null,
      rank: s?.rank ?? null,
      winRate: s?.win_rate ?? null,
      pickRate: s?.pick_rate ?? null,
      change: s?.change ?? null,
      damage: s?.damage ?? null,
      tank: s?.tank ?? null,
      kp: s?.kp ?? null,
      dead: s?.dead ?? null,
      augments: (b?.augments?.all ?? []).filter((a) => AUGS[a.id]).slice(0, 5).map((a) => a.id),
      core: core ? { items: core.items.filter((id) => !rewardItems().has(id)), winRate: core.win_rate } : null,
      skills: b?.skills?.[0]?.max_order ?? [],
      partners: (b?.partners ?? []).map((p) => ALIAS[p.id]).filter(Boolean).slice(0, 3),
      sim: sim
        ? {
            dps: sim.summary.mean_dps,
            survival: sim.summary.survival_rate,
            kpm: sim.summary.kills_per_minute,
            items: simItemIds,
            augments: sim.build.augments.map((k) => simAugs[k]?.id).filter((v): v is number => Boolean(v)),
          }
        : null,
      tags: championTags(alias),
    };
  });
  const itemInfo = Object.fromEntries([...usedItems].map((id) => [id, item(id) ?? { id, name: `Item ${id}` }]));
  return { patch, champions: champions.sort((a, b) => a.name.localeCompare(b.name)), items: itemInfo, tagInfo: championTagData().info };
}
