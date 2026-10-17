import "server-only";
import { readFileSync } from "node:fs";
import championIds from "@/data/champion-ids.json";
import augmentNames from "@/data/augment-names.json";
import { liveWithChange } from "./champions";
import { items, rewardItems } from "./items";
import { repoHas, repoPath, readRepoJson } from "./repo-data";

// The ranked tables on a champion page (/champions/<Alias>): skill orders, item paths, augments,
// teammates, Mayhem's ability changes and base stats. Every row with a win rate also carries its
// "win lift", the row's win rate minus the champion's own, so a build that beats the champion's
// average stands out. Data: data/cn/builds/<id>.json (builds), data/cn/duos.json (pairs) and
// champions/data.js (ability changes, base stats, build styles).

const IDS = championIds as Record<string, number>;
const ALIAS = Object.fromEntries(Object.entries(IDS).map(([alias, id]) => [id, alias]));
const AUGS = augmentNames as Record<string, string>;

/** A pair only counts as a teammate once it shows up in at least this share of games. */
export const MIN_PAIR_PICK = 0.008;

type Raw = { items: number[]; pick_rate: number; win_rate?: number };
type Builds = {
  items?: Partial<Record<"starting" | "boots" | "core" | "other" | "full_builds", Raw[]>>;
  skills?: { max_order: string[]; pick_rate: number; win_rate: number; orders?: { order: string[] }[] }[];
  augments?: Record<string, { id: number; pick_rate: number; grade?: string }[]>;
};
type Duos = { duos: { champion_ids: number[]; win_rate: number; pick_rate: number }[] };

export type Rated = { winRate: number; pickRate: number; lift: number };
export type ItemRow = Rated & { items: number[] };
export type SkillRow = Rated & { max: string[]; levels: string[] };
export type AugmentRow = { id: number; name: string; rarity: "prismatic" | "gold" | "silver"; grade: string; pickRate: number };
export type Mate = Rated & { id: string; synergy: number };
export type Change = { slot: string; name: string; ability: string; icon?: string; rift: number[]; mayhem: number[] };
export type BaseStats = {
  hp: number[];
  hp5: number[];
  ad: number[];
  as: number[];
  armor: number[];
  mr: number[];
  range: number;
  ms: number;
  resource?: { kind: string; base: number[]; regen: number[] };
};
export type Style = { label: string; share: number; winRate: number; lift: number };

export type ChampionPage = {
  winRate: number;
  skills: SkillRow[];
  starting: ItemRow[];
  boots: ItemRow[];
  core: ItemRow[];
  full: ItemRow[];
  items: ItemRow[];
  augments: AugmentRow[];
  mates: Mate[];
  styles: Style[];
  changes: Change[];
  modifiers: Record<string, number>;
  stats: BaseStats | null;
  /** Names and icons of every item the tables show. */
  itemInfo: Record<number, { name: string; icon?: string }>;
};

type ClientChamp = {
  alias: string;
  stats?: BaseStats;
  abilities?: { slot: string; name: string; icon?: string }[];
  mayhem?: { slot: string; name: string; rift: number[]; mayhem: number[] }[];
  builds?: { styles?: { label: string; share: number; win: number }[] };
};

// champions/data.js and modifiers.js are the champion tab's own files: a `window.X = {...};` assignment each.
const loaded = new Map<string, unknown>();
function windowJson<T>(rel: string): T | null {
  if (!loaded.has(rel)) {
    let v: unknown = null;
    if (repoHas(rel)) {
      const text = readFileSync(repoPath(rel), "utf8");
      v = JSON.parse(text.slice(text.indexOf("=") + 1).trim().replace(/;\s*$/, ""));
    }
    loaded.set(rel, v);
  }
  return loaded.get(rel) as T | null;
}

const RARITIES = ["prismatic", "gold", "silver"] as const;

export function championPage(alias: string): ChampionPage | null {
  const id = IDS[alias];
  if (id === undefined) return null;
  const { live } = liveWithChange();
  const rates = new Map(live.map((c) => [c.name, c.win_rate]));
  const base = rates.get(alias) ?? 0.5;
  const rated = (win: number | undefined, pick: number): Rated => ({ winRate: win ?? 0, pickRate: pick, lift: (win ?? 0) - base });

  const b = readRepoJson<Builds>(`data/cn/builds/${id}.json`);
  const rewards = rewardItems();
  const all = items();
  const rows = (list: Raw[] | undefined) =>
    (list ?? []).filter((r) => r.items.every((i) => all.has(i) && !rewards.has(i))).map((r) => ({ items: r.items, ...rated(r.win_rate, r.pick_rate) }));

  const skills = (b?.skills ?? []).map((s) => ({ max: s.max_order, levels: s.orders?.[0]?.order ?? [], ...rated(s.win_rate, s.pick_rate) }));

  const rarity = new Map<number, AugmentRow["rarity"]>();
  for (const r of RARITIES) for (const a of b?.augments?.[r] ?? []) rarity.set(a.id, r);
  const augments = (b?.augments?.all ?? [])
    .filter((a) => AUGS[a.id])
    .map((a) => ({ id: a.id, name: AUGS[a.id], rarity: rarity.get(a.id) ?? "silver", grade: a.grade ?? "", pickRate: a.pick_rate }));

  // Synergy: how much more a pair wins together than the two champions do on average on their own.
  const mates = (readRepoJson<Duos>("data/cn/duos.json")?.duos ?? [])
    .filter((d) => d.champion_ids.includes(id) && d.pick_rate >= MIN_PAIR_PICK)
    .flatMap((d) => {
      const other = ALIAS[d.champion_ids.find((c) => c !== id) ?? -1];
      const theirs = other ? rates.get(other) : undefined;
      if (!other || theirs === undefined) return [];
      return [{ id: other, synergy: d.win_rate - (base + theirs) / 2, ...rated(d.win_rate, d.pick_rate) }];
    })
    .sort((x, y) => y.synergy - x.synergy);

  const client = windowJson<{ champions: ClientChamp[] }>("champions/data.js")?.champions.find((c) => c.alias === alias);
  const abilities = new Map((client?.abilities ?? []).map((a) => [a.slot, a]));
  const changes = (client?.mayhem ?? []).map((m) => ({ ...m, ability: abilities.get(m.slot)?.name ?? "", icon: abilities.get(m.slot)?.icon }));
  const styles = (client?.builds?.styles ?? []).map((s) => ({ label: s.label, share: s.share, ...rated(s.win, s.share) }));
  const modifiers = windowJson<Record<string, Record<string, number>>>("champions/modifiers.js")?.[alias] ?? {};

  const page = {
    winRate: base,
    skills,
    starting: rows(b?.items?.starting),
    boots: rows(b?.items?.boots),
    core: rows(b?.items?.core),
    full: rows(b?.items?.full_builds),
    items: rows(b?.items?.other),
    augments,
    mates,
    styles,
    changes,
    modifiers,
    stats: client?.stats ?? null,
  };
  const used = new Set([page.starting, page.boots, page.core, page.full, page.items].flat().flatMap((r) => r.items));
  const itemInfo = Object.fromEntries([...used].map((i) => [i, { name: all.get(i)!.name, icon: all.get(i)!.icon }]));
  return { ...page, itemInfo };
}

/** The row players should copy: most wins among rows with a real following (2% of games, or the top three). */
export function bestRow<T extends Rated>(rows: T[], min = 0.02): T | null {
  const common = rows.filter((r, i) => r.pickRate >= min || i < 3);
  return common.length ? common.reduce((a, r) => (r.winRate > a.winRate ? r : a)) : null;
}
