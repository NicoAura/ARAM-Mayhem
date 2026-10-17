import "server-only";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import championIds from "@/data/champion-ids.json";
import augmentNames from "@/data/augment-names.json";
import { champName, livePatch } from "./highlights";
import { localAsset } from "./assets";
import { readRepoCsv, readRepoJson } from "./repo-data";
import { champStats, type ChampStats, type PatchRow } from "./tiers";

// One summary per champion for its own page (/champions/<Alias>) and the home page's movers:
// live-patch tier and rates, the change since the previous patch, top augments and best partners.

const IDS = championIds as Record<string, number>;
const ALIAS = Object.fromEntries(Object.entries(IDS).map(([alias, id]) => [id, alias]));
const AUGS = augmentNames as Record<string, string>;

export const championAliases = () => Object.keys(IDS);

const num = (v?: string) => (v === undefined || v === "" ? null : Number(v));

/** Every champion row of every patch, oldest patch first (data/cn/history/by_patch.csv). */
export function patchRows(): PatchRow[] {
  return (readRepoCsv("data/cn/history/by_patch.csv") ?? []).map((r) => ({
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
}

export const patchList = () => (readRepoCsv("data/cn/history/patches.csv") ?? []).map((p) => p.patch);

export type Mover = { id: string; name: string; tier: string; winRate: number; change: number };

/** Each champion's live-patch stats with its win-rate change since the previous patch (null if it wasn't there). */
let cache: { live: (ChampStats & { change: number | null; rank: number })[]; patch: string | null; prev: string | null } | null = null;
export function liveWithChange() {
  if (cache) return cache;
  const rows = patchRows();
  const patches = patchList();
  const patch = livePatch();
  const prev = patches.length > 1 ? patches[patches.length - 2] : null;
  const before = new Map(prev ? champStats(rows, new Set([prev])).map((c) => [c.name, c.win_rate]) : []);
  const live = patch
    ? champStats(rows, new Set([patch])).map((c, i) => {
        const was = before.get(c.name);
        return { ...c, rank: i + 1, change: was === undefined ? null : c.win_rate - was };
      })
    : [];
  cache = { live, patch, prev };
  return cache;
}

/** Biggest win-rate gains and drops since the previous patch. */
export function movers(n = 4): { up: Mover[]; down: Mover[]; prev: string | null } {
  const { live, prev } = liveWithChange();
  const withChange = live
    .filter((c) => c.change !== null)
    .map((c) => ({ id: c.name, name: champName(c.name), tier: c.tier, winRate: c.win_rate, change: c.change! }));
  const sorted = [...withChange].sort((a, b) => b.change - a.change);
  return { up: sorted.slice(0, n), down: sorted.slice(-n).reverse(), prev };
}

type ClientChampion = { title?: string; shortBio?: string; skins?: { splashPath?: string; uncenteredSplashPath?: string }[] };
const GAME_DATA = "plugins/rcp-be-lol-game-data/global/default";

// The client's own champion file, mirrored in public/assets/ (title, bio, splash).
function clientChampion(id: number): ClientChampion | null {
  const file = join(process.cwd(), "public", "assets", "cd", "latest", GAME_DATA, "v1", "champions", `${id}.json`);
  return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as ClientChampion) : null;
}

const clientAsset = (p?: string) =>
  p ? localAsset(`https://raw.communitydragon.org/latest/${GAME_DATA}/${p.replace(/^\/lol-game-data\/assets\//i, "")}`) : undefined;

export type ChampionSummary = {
  alias: string;
  name: string;
  title: string;
  bio: string;
  splash?: string;
  patch: string | null;
  prev: string | null;
  tier?: string;
  rank?: number;
  of: number;
  winRate?: number;
  pickRate?: number;
  change: number | null;
  augments: { id: string; name: string }[];
  partners: { id: string; name: string; winRate: number }[];
};

type Champs = { champions: { name: string; best_partners?: { champion_id: number; win_rate: number }[] }[] };

export function championSummary(alias: string): ChampionSummary | null {
  const id = IDS[alias];
  if (id === undefined) return null;
  const { live, patch, prev } = liveWithChange();
  const me = live.find((c) => c.name === alias);
  const client = clientChampion(id);
  const skin = client?.skins?.[0];
  const liveRow = patchRows().find((r) => r.patch === patch && r.name === alias);
  const partners = (readRepoJson<Champs>("data/cn/champions.json")?.champions.find((c) => c.name === alias)?.best_partners ?? [])
    .slice(0, 3)
    .map((p) => ({ id: ALIAS[p.champion_id], name: champName(ALIAS[p.champion_id] ?? ""), winRate: p.win_rate }))
    .filter((p) => p.id);
  return {
    alias,
    name: champName(alias),
    title: client?.title ?? "",
    bio: client?.shortBio ?? "",
    splash: clientAsset(skin?.uncenteredSplashPath || skin?.splashPath),
    patch,
    prev,
    tier: me?.tier,
    rank: me?.rank,
    of: live.length,
    winRate: me?.win_rate,
    pickRate: me?.pick_rate,
    change: me?.change ?? null,
    augments: (liveRow?.augs ?? "")
      .split(",")
      .map((a) => a.trim())
      .filter((a) => AUGS[a])
      .map((a) => ({ id: a, name: AUGS[a] })),
    partners,
  };
}
