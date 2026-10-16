import "server-only";
import augmentNames from "@/data/augment-names.json";
import championNames from "@/data/champion-names.json";
import type { SearchItem } from "@/components/SearchPalette";
import { readRepoCsv, readRepoJson } from "./repo-data";
import { allTabs, discoverToolTabs } from "./tabs";

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

type Pbe = {
  meta: { label: string; augmentCounts: { added: number; removed: number } };
  headliners: { list: { name: string; effect: string }[] };
};
export const pbeSummary = () => readRepoJson<Pbe>("data/pbe/kiwi-s3.json");

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

export const toolTabs = () => discoverToolTabs();

export function searchItems(): SearchItem[] {
  const pct = (v: number) => `${(v * 100).toFixed(1)}% win`;
  const pages: SearchItem[] = [{ group: "Pages", name: "Home", hint: "Page", href: "/" }, ...allTabs().map((t) => ({ group: "Pages", name: t.label, hint: "Page", href: t.href }))];
  const champs = (readRepoCsv("data/cn/champions.csv") ?? []).map((r) => ({
    group: "Champions",
    name: champName(r.name),
    hint: pct(Number(r.win_rate)),
    href: `/tier-list?q=${encodeURIComponent(champName(r.name))}`,
    icon: `/icons/champions/${r.name}.webp`,
  }));
  const augs = (readRepoCsv("data/cn/augments.csv") ?? [])
    .filter((r) => AUGS[r.augment_id])
    .map((r) => ({
      group: "Augments",
      name: AUGS[r.augment_id],
      hint: r.tier || "Augment",
      href: `/tier-list?tab=augments&q=${encodeURIComponent(AUGS[r.augment_id])}`,
      icon: `/icons/augments/${r.augment_id}.webp`,
    }));
  return [...pages, ...champs.sort((a, b) => a.name.localeCompare(b.name)), ...augs.sort((a, b) => a.name.localeCompare(b.name))];
}
