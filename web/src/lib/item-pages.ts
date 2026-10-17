import "server-only";
import championIds from "@/data/champion-ids.json";
import { augmentSlug } from "./augments";
import { champName } from "./highlights";
import { items } from "./items";
import { readRepoJson } from "./repo-data";

// One page per item that Mayhem players build (/items/<slug>): its stats and cost from the client's
// item list, and the champions who build it most (data/cn/builds/<id>.json).

const IDS = championIds as Record<string, number>;

type Entry = { items: number[]; pick_rate: number; win_rate?: number };
type Builds = { items?: Record<string, Entry[]> };

export type ItemPage = {
  id: number;
  slug: string;
  name: string;
  icon?: string;
  cost: number;
  stats: string[];
  builders: { id: string; name: string; pickRate: number; winRate: number | null }[];
};

// "<stats>75 Attack Damage<br>25% Critical Strike Chance</stats>" -> ["75 Attack Damage", "25% Critical Strike Chance"]
function statLines(description: string) {
  const stats = description.match(/<stats>([\s\S]*?)<\/stats>/i)?.[1] ?? "";
  return stats
    .split(/<br\s*\/?>/i)
    .map((l) => l.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

let cache: ItemPage[] | null = null;
export function itemPages(): ItemPage[] {
  if (cache) return cache;
  const all = items();
  const raw = readRepoJson<{ id: number; description?: string; priceTotal?: number }[]>(
    "web/public/assets/cd/latest/plugins/rcp-be-lol-game-data/global/default/v1/items.json",
  );
  const info = new Map((raw ?? []).map((i) => [i.id, i]));
  // Single-item entries are how often a champion builds that item at all.
  const builders = new Map<number, ItemPage["builders"]>();
  for (const [alias, cid] of Object.entries(IDS)) {
    const b = readRepoJson<Builds>(`data/cn/builds/${cid}.json`)?.items ?? {};
    for (const e of [...(b.other ?? []), ...(b.boots ?? []), ...(b.starting ?? [])]) {
      if (e.items.length !== 1) continue;
      const id = e.items[0];
      builders.set(id, [...(builders.get(id) ?? []), { id: alias, name: champName(alias), pickRate: e.pick_rate, winRate: e.win_rate ?? null }]);
    }
  }
  const slugs = new Set<string>();
  cache = [...builders.keys()]
    .map((id) => all.get(id))
    .filter((i): i is NonNullable<typeof i> => Boolean(i))
    .map((i) => {
      let slug = augmentSlug(i.name);
      if (slugs.has(slug)) slug = `${slug}-${i.id}`;
      slugs.add(slug);
      return {
        id: i.id,
        slug,
        name: i.name,
        icon: i.icon,
        cost: info.get(i.id)?.priceTotal ?? 0,
        stats: statLines(info.get(i.id)?.description ?? ""),
        builders: builders.get(i.id)!.sort((x, y) => y.pickRate - x.pickRate).slice(0, 10),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  return cache;
}

export const itemBySlug = (slug: string) => itemPages().find((i) => i.slug === slug) ?? null;
