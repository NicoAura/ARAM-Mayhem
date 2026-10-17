import "server-only";
import championIds from "@/data/champion-ids.json";
import { liveWithChange } from "./champions";
import { champName } from "./highlights";
import { item } from "./items";
import { readRepoJson } from "./repo-data";
import type { BotChampion, BotData } from "./discord";

// What the Discord bot answers with (/data/bot.json): each champion's live-patch tier and its most picked build.
// Built once per deploy from the same numbers as the Tier List and champion pages.

const IDS = championIds as Record<string, number>;

type Combo = { items: number[]; pick_rate: number; win_rate: number };
type Builds = {
  skills?: { max_order: string[]; pick_rate: number }[];
  items?: { boots?: Combo[]; core?: Combo[]; full_builds?: Combo[] };
};

const mostPicked = <T extends { pick_rate: number }>(list?: T[]) =>
  list?.length ? list.reduce((a, b) => (b.pick_rate > a.pick_rate ? b : a)) : undefined;
const names = (ids?: number[]) => (ids ?? []).map((id) => item(id)?.name).filter((n): n is string => !!n);

export function botData(): BotData {
  const { live, patch } = liveWithChange();
  const champions: Record<string, BotChampion> = {};
  for (const c of live) {
    const b = IDS[c.name] === undefined ? null : readRepoJson<Builds>(`data/cn/builds/${IDS[c.name]}.json`);
    const core = mostPicked(b?.items?.core);
    const full = mostPicked(b?.items?.full_builds)?.items ?? [];
    // The boots that go with the full build, so the two lists agree; else the most picked pair.
    const boots = b?.items?.boots?.find((o) => full.includes(o.items[0])) ?? mostPicked(b?.items?.boots);
    champions[c.name] = {
      name: champName(c.name),
      tier: c.tier,
      rank: c.rank,
      winRate: c.win_rate,
      pickRate: c.pick_rate,
      augments: c.top_augments ? c.top_augments.split(", ").slice(0, 3) : [],
      core: names(core?.items),
      coreWinRate: core?.win_rate ?? null,
      boots: names(boots?.items)[0] ?? null,
      full: names(full),
      skills: mostPicked(b?.skills)?.max_order ?? [],
    };
  }
  return { patch, of: live.length, champions };
}
