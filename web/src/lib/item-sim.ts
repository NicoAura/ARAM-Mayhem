import "server-only";
import championIds from "@/data/champion-ids.json";
import simData from "@/data/item-sim.json";
import { champName } from "./highlights";

// Simulated damage per item (/items/<slug>): for the champions who build it most, how much damage and
// time alive the item adds to their simulated best build. Written by scripts/build_item_sim.py.

type Row = { champ: string; dps: number; base: number; alive: number };
const DATA = simData as { patch: string; items: Record<string, Row[]> };
const ALIAS = new Map(Object.keys(championIds).map((a) => [a.toLowerCase(), a]));

export type ItemSim = {
  patch: string;
  gain: number; // median damage change, as a share of the build without the item
  alive: number; // median seconds alive gained
  champs: { id: string; name: string; dps: number; gain: number; alive: number }[];
};

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export function itemSim(id: number): ItemSim | null {
  const rows = DATA.items[String(id)];
  if (!rows?.length) return null;
  const champs = rows.map((r) => {
    const alias = ALIAS.get(r.champ.toLowerCase()) ?? r.champ;
    return { id: alias, name: champName(alias), dps: r.dps, gain: r.base > 0 ? r.dps / r.base - 1 : 0, alive: r.alive };
  });
  return { patch: DATA.patch, gain: median(champs.map((c) => c.gain)), alive: median(champs.map((c) => c.alive)), champs };
}
