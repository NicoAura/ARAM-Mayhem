import "server-only";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import championIds from "@/data/champion-ids.json";
import augmentNames from "@/data/augment-names.json";
import { localAsset } from "./assets";
import { champName } from "./highlights";

// What the Build Editor needs beside the simulator's own lists: each item's icon, gold cost and stats
// (read from its description), each augment's icon id and each champion's display name. Keyed by name,
// since the simulator names items and augments the way the client does.
const GAME_DATA = "plugins/rcp-be-lol-game-data/global/default";

export type BuilderItem = { icon?: string; price: number; stats: [number, boolean, string][] };
export type BuilderData = {
  items: Record<string, BuilderItem>;
  augments: Record<string, number>;
  champions: Record<string, string>;
};

type Raw = { id: number; name: string; priceTotal?: number; iconPath?: string; description?: string };

// "<stats><attention> 75</attention> Attack Damage<br>…</stats>" → [[75, false, "Attack Damage"], …]
const stats = (desc = ""): BuilderItem["stats"] => {
  const block = /<stats>(.*?)<\/stats>/i.exec(desc)?.[1] ?? "";
  return block
    .split(/<br\s*\/?>/i)
    .map((l) => l.replace(/<[^>]+>/g, "").trim())
    .flatMap((l) => {
      const m = /^([\d.]+)(%?)\s+(.+)$/.exec(l);
      return m ? [[Number(m[1]), m[2] === "%", m[3]] as [number, boolean, string]] : [];
    });
};

export function builderData(): BuilderData {
  const file = join(process.cwd(), "public", "assets", "cd", "latest", GAME_DATA, "v1", "items.json");
  const list = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as Raw[]) : [];
  const items: Record<string, BuilderItem> = {};
  // The plain ids (under 10000) are the standard shop's copy; mode variants reuse the name with a prefix.
  for (const i of [...list].sort((a, b) => Number(a.id >= 10000) - Number(b.id >= 10000) || a.id - b.id)) {
    if (items[i.name] || !i.priceTotal) continue;
    items[i.name] = {
      icon: i.iconPath ? localAsset(`https://raw.communitydragon.org/latest/${GAME_DATA}/${i.iconPath.replace(/^\/lol-game-data\/assets\//i, "")}`) : undefined,
      price: i.priceTotal,
      stats: stats(i.description),
    };
  }
  const augments: Record<string, number> = {};
  // Several ids can share a name (other modes' copies); keep the one with an icon.
  const iconDir = join(process.cwd(), "public", "icons", "augments");
  for (const [id, name] of Object.entries(augmentNames as Record<string, string>)) {
    if (existsSync(join(iconDir, `${id}.webp`))) augments[name] ??= Number(id);
  }
  const champions = Object.fromEntries(Object.keys(championIds).map((a) => [a, champName(a)]));
  return { items, augments, champions };
}
