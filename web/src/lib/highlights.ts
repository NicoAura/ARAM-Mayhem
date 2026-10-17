import "server-only";
import augmentNames from "@/data/augment-names.json";
import championNames from "@/data/champion-names.json";
import type { SearchItem } from "@/components/SearchPalette";
import { augmentHref } from "./augments";
import { itemPages } from "./item-pages";
import { readRepoCsv, readRepoJson } from "./repo-data";
import { navPages } from "./tabs";
import { BETA } from "./beta";
import { champStats, type PatchRow } from "./tiers";

// Small summaries of each section's data, read from the repo at build time.
// Used by the home page highlights and the header search.

const CHAMPS = championNames as Record<string, string>;
const AUGS = augmentNames as Record<string, string>;

export const champName = (id: string) => CHAMPS[id] ?? id.replace(/([a-z])([A-Z])/g, "$1 $2");

export type Ranked = { id: string; name: string; winRate: number; pickRate: number; tier?: string };

export function topChampions(n = 6): Ranked[] {
  const rows = readRepoCsv("data/cn/champions.csv") ?? [];
  return rows
    .map((r) => ({ id: r.name, name: champName(r.name), winRate: Number(r.win_rate), pickRate: Number(r.pick_rate) }))
    .sort((a, b) => b.winRate - a.winRate)
    .slice(0, n);
}

export function topAugments(n = 6): Ranked[] {
  const rows = readRepoCsv("data/cn/augments.csv") ?? [];
  return rows
    .filter((r) => r.tier && AUGS[r.augment_id])
    .map((r) => ({ id: r.augment_id, name: AUGS[r.augment_id], tier: r.tier, winRate: Number(r.win_rate), pickRate: Number(r.pick_rate) }))
    .sort((a, b) => b.winRate - a.winRate)
    .slice(0, n);
}

export function statsDate() {
  const meta = readRepoJson<{ meta: { champion_stat_date?: string } }>("data/cn/champions.json")?.meta;
  const d = meta?.champion_stat_date;
  return d && d.length === 8 ? new Date(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}T00:00:00Z`) : null;
}

/** The live patch the current stats cover, like "16.20". PBE data stays on the PBE tab. */
export const livePatch = () => readRepoCsv("data/cn/history/patches.csv")?.at(-1)?.patch ?? null;

type Builds = { builds: { champion: string; title: string; augments: string[]; why: string }[] };
export const kitchenBuild = () => readRepoJson<Builds>("data/cook-builds/builds.json")?.builds[0] ?? null;

type Best = { champions: { champion: string; summary: { mean_dps: number } }[] };
export function topDps(n = 5) {
  const best = readRepoJson<Best>("simulator/viewer/replay-data/best-builds.json");
  return (best?.champions ?? [])
    .map((c) => ({ id: c.champion, name: champName(c.champion), dps: c.summary.mean_dps }))
    .sort((a, b) => b.dps - a.dps)
    .slice(0, n);
}

export function counts() {
  return {
    champions: readRepoCsv("data/cn/champions.csv")?.length ?? 0,
    augments: (readRepoCsv("data/cn/augments.csv") ?? []).filter((r) => r.tier).length,
  };
}

export const searchPages = (): SearchItem[] => [
  { group: "Pages", name: "Home", hint: "Page", href: "/" },
  ...[...navPages(), { href: "/stats", label: "My Stats" }].map((t) => ({ group: "Pages", name: t.label, hint: BETA.has(t.href) ? "Page · Beta" : "Page", href: t.href })),
];

export function searchItems(): SearchItem[] {
  const pct = (v: number) => `${(v * 100).toFixed(1)}% win`;
  const pages = searchPages();
  const champs = (readRepoCsv("data/cn/champions.csv") ?? []).map((r) => ({
    group: "Champions",
    name: champName(r.name),
    hint: pct(Number(r.win_rate)),
    href: `/champions/${r.name}`,
    icon: `/icons/champions/${r.name}.webp`,
  }));
  const augs = (readRepoCsv("data/cn/augments.csv") ?? [])
    .filter((r) => AUGS[r.augment_id])
    .map((r) => ({
      group: "Augments",
      name: AUGS[r.augment_id],
      hint: r.tier || "Augment",
      href: augmentHref(r.augment_id) ?? `/tier-list?tab=augments&q=${encodeURIComponent(AUGS[r.augment_id])}`,
      icon: `/icons/augments/${r.augment_id}.webp`,
    }));
  const builtItems = itemPages().map((i) => ({ group: "Items", name: i.name, hint: i.cost ? `${i.cost} gold` : "Item", href: `/items/${i.slug}`, icon: i.icon }));
  return [
    ...pages,
    ...champs.sort((a, b) => a.name.localeCompare(b.name)),
    ...augs.sort((a, b) => a.name.localeCompare(b.name)),
    ...builtItems,
  ];
}

export type HomeChamp = { id: string; name: string; tier: string; winRate: number; pickRate: number };

/** Live-patch tiers for every champion (same Bayesian tiers as the Tier List's default view). */
export function liveTiers(): HomeChamp[] {
  const patch = livePatch();
  const num = (v?: string) => (v === undefined || v === "" ? null : Number(v));
  const rows: PatchRow[] = (readRepoCsv("data/cn/history/by_patch.csv") ?? [])
    .filter((r) => r.patch === patch)
    .map((r) => ({
      patch: r.patch,
      days: Number(r.days),
      name: r.name,
      win_rate: Number(r.win_rate),
      pick_rate: Number(r.pick_rate),
      damage: num(r.avg_damage_ratio),
      tank: num(r.avg_tank_ratio),
      kp: num(r.avg_participation_rate),
      dead: num(r.avg_death_time),
      augs: r.augment_ids ?? "",
    }));
  if (!patch || !rows.length) return [];
  return champStats(rows, new Set([patch])).map((c) => ({ id: c.name, name: champName(c.name), tier: c.tier, winRate: c.win_rate, pickRate: c.pick_rate }));
}

export const kitchenBuilds = () => readRepoJson<Builds>("data/cook-builds/builds.json")?.builds ?? [];
