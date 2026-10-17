import "server-only";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { localAsset } from "./assets";

// Item names and icons from the client's item list, mirrored in public/assets/.
const GAME_DATA = "plugins/rcp-be-lol-game-data/global/default";

export type Item = { id: number; name: string; icon?: string };

let cache: Map<number, Item> | null = null;
export function items(): Map<number, Item> {
  if (cache) return cache;
  const file = join(process.cwd(), "public", "assets", "cd", "latest", GAME_DATA, "v1", "items.json");
  const list = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as { id: number; name: string; iconPath?: string }[]) : [];
  cache = new Map(
    list.map((i) => [
      i.id,
      {
        id: i.id,
        name: i.name,
        icon: i.iconPath ? localAsset(`https://raw.communitydragon.org/latest/${GAME_DATA}/${i.iconPath.replace(/^\/lol-game-data\/assets\//i, "")}`) : undefined,
      },
    ]),
  );
  return cache;
}

export const item = (id: number) => items().get(id);
