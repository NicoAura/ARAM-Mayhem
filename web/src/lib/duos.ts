import "server-only";
import { readRepoJson } from "./repo-data";

type Duos = { duos: { names: string[]; roles?: string[]; win_rate: number; pick_rate: number; rank?: number }[] };

export const hasDuos = () => Boolean(readRepoJson<Duos>("data/cn/duos.json")?.duos.length);

export const duoRows = () =>
  (readRepoJson<Duos>("data/cn/duos.json")?.duos ?? []).map((d) => ({
    a: d.names[0],
    b: d.names[1],
    pair: d.names.join(" "),
    win_rate: d.win_rate,
    pick_rate: d.pick_rate,
    rank: d.rank ?? null,
    roles: (d.roles ?? []).map((r) => r.replace(/,/g, "/")).join(" + "),
  }));
