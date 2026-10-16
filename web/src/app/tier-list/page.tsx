import type { Metadata } from "next";
import augmentNames from "@/data/augment-names.json";
import { AdvancedProvider, AdvancedToggle } from "@/components/Advanced";
import ChampionTiers from "@/components/ChampionTiers";
import DataTable from "@/components/DataTable";
import championIds from "@/data/champion-ids.json";
import championNames from "@/data/champion-names.json";
import type { PatchRow } from "@/lib/tiers";
import Intro from "@/components/Intro";
import { text } from "@/lib/content";
import Pending from "@/components/Pending";
import SubTabs from "@/components/SubTabs";
import { readRepoCsv, readRepoJson } from "@/lib/repo-data";

export const metadata: Metadata = { title: "Tier List · DeepARAM" };

type Duos = { meta: { champion_stat_date?: string }; duos: { names: string[]; roles?: string[]; win_rate: number; pick_rate: number; rank?: number }[] };

const num = (v: string | undefined) => (v === undefined || v === "" ? null : Number(v));
const ALIAS = Object.fromEntries(Object.entries(championIds as Record<string, number>).map(([alias, id]) => [id, alias]));
const NAMES = championNames as Record<string, string>;
type Champs = { champions: { name: string; best_partners?: { champion_id: number }[] }[] };
const names = augmentNames as Record<string, string>;

export default function TierListPage() {
  const byPatch = readRepoCsv("data/cn/history/by_patch.csv");
  const patches = readRepoCsv("data/cn/history/patches.csv");
  const augments = readRepoJson<{ augments: Record<string, string | number | number[]>[] }>("data/cn/augments.json")?.augments;
  const duos = readRepoJson<Duos>("data/cn/duos.json");
  const champs = readRepoJson<Champs>("data/cn/champions.json");

  if (!byPatch || !patches?.length) {
    return (
      <>
        <Intro eyebrow="Tier List" title={text("page./tier-list.title", "Every Mayhem champion and augment, ranked.")} />
        <Pending pr={5}>Champion, augment and duo stats appear here once the stats data is merged:</Pending>
      </>
    );
  }

  const latest = patches.at(-1)!;
  const rows: PatchRow[] = byPatch.map((r) => ({
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
  const champName = (alias?: string) => (alias ? (NAMES[alias] ?? alias) : null);
  const partners = Object.fromEntries(
    (champs?.champions ?? []).map((c) => [
      c.name,
      (c.best_partners ?? [])
        .slice(0, 3)
        .map((p) => champName(ALIAS[p.champion_id]))
        .filter(Boolean)
        .join(", "),
    ]),
  );
  const tabs = [
    {
      id: "champions",
      label: "Champions",
      content: <ChampionTiers rows={rows} patches={patches.map((p) => p.patch)} partners={partners} />,
    },
  ];
  if (augments) {
    const augName = (a: Record<string, unknown>) => names[String(a.augment_id)] ?? String(a.key).replace(/^ARAM_/, "");
    const augCols = [
      { key: "name", label: "Augment", format: "augment" as const, iconKey: "id" },
      { key: "tier", label: "Rarity", format: "tier" as const },
      { key: "win_rate", label: "Win rate", format: "pct" as const },
      { key: "pick_rate", label: "Pick rate", format: "pct" as const },
    ];
    tabs.push({
      id: "augments",
      label: "Augments",
      content: (
        <>
          <p className="patch-note">Augments are for the live patch ({latest.patch}).</p>
          <DataTable
            columns={augCols}
            advancedColumns={[
              ...augCols,
              { key: "win_rank", label: "Win rank", format: "int" },
              { key: "win_change", label: "Win rank change", format: "int" },
              { key: "pick_rank", label: "Pick rank", format: "int" },
              { key: "pick_change", label: "Pick rank change", format: "int" },
              { key: "best", label: "Best champions", format: "text", sortable: false },
            ]}
            rows={augments
              .filter((a) => names[String(a.augment_id)] || a.key)
              .map((a) => ({
                id: Number(a.augment_id),
                name: augName(a),
                tier: String(a.tier ?? ""),
                win_rate: Number(a.win_rate),
                pick_rate: Number(a.pick_rate),
                win_rank: num(String(a.win_rank ?? "")),
                win_change: num(String(a.win_rank_change ?? "")),
                pick_rank: num(String(a.pick_rank ?? "")),
                pick_change: num(String(a.pick_rank_change ?? "")),
                best: ((a.best_champions as number[]) ?? [])
                  .slice(0, 4)
                  .map((id) => champName(ALIAS[id]))
                  .filter(Boolean)
                  .join(", "),
              }))}
            initialSort={{ key: "win_rate", desc: true }}
            searchKey="name"
            searchLabel="Find an augment"
            urlTab="augments"
          />
        </>
      ),
    });
  }
  if (duos) {
    tabs.push({
      id: "duos",
      label: "Duos",
      content: (
        <DataTable
          columns={[
            { key: "a", label: "Champion", format: "champion" },
            { key: "b", label: "With", format: "champion" },
            { key: "win_rate", label: "Win rate", format: "pct" },
            { key: "pick_rate", label: "Pick rate", format: "pct" },
          ]}
          advancedColumns={[
            { key: "a", label: "Champion", format: "champion" },
            { key: "b", label: "With", format: "champion" },
            { key: "win_rate", label: "Win rate", format: "pct" },
            { key: "pick_rate", label: "Pick rate", format: "pct" },
            { key: "rank", label: "Rank", format: "int" },
            { key: "roles", label: "Roles", format: "text", sortable: false },
          ]}
          rows={duos.duos.map((d) => ({
            a: d.names[0],
            b: d.names[1],
            pair: d.names.join(" "),
            win_rate: d.win_rate,
            pick_rate: d.pick_rate,
            rank: d.rank ?? null,
            roles: (d.roles ?? []).map((r) => r.replace(/,/g, "/")).join(" + "),
          }))}
          initialSort={{ key: "win_rate", desc: true }}
          searchKey="pair"
          searchLabel="Find a champion"
        />
      ),
    });
  }

  return (
    <AdvancedProvider>
      <Intro eyebrow={`Tier List · Patch ${latest.patch}`} title={text("page./tier-list.title", "Every Mayhem champion and augment, ranked.")}>
        Live patch {latest.patch} by default. Pick any patches, or all time, above the champion table. Advanced shows every stat we have.
      </Intro>
      <div className="tier-view">
        <AdvancedToggle />
      </div>
      <SubTabs tabs={tabs} />
    </AdvancedProvider>
  );
}
