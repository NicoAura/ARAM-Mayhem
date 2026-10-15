import type { Metadata } from "next";
import augmentNames from "@/data/augment-names.json";
import DataTable, { type Column, type Row } from "@/components/DataTable";
import Intro from "@/components/Intro";
import Pending from "@/components/Pending";
import SubTabs from "@/components/SubTabs";
import { readRepoCsv, readRepoJson, type CsvRow } from "@/lib/repo-data";

export const metadata: Metadata = { title: "China Stats · ARAM Mayhem" };

type Duos = { meta: { champion_stat_date?: string }; duos: { names: string[]; win_rate: number; pick_rate: number }[] };

const num = (v: string) => (v === "" ? null : Number(v));
const names = augmentNames as Record<string, string>;

function champRows(rows: CsvRow[]): Row[] {
  return rows.map((r) => ({
    name: r.name,
    win_rate: num(r.win_rate),
    pick_rate: num(r.pick_rate),
    damage: num(r.avg_damage_ratio),
    tank: num(r.avg_tank_ratio),
    kp: num(r.avg_participation_rate),
    dead: num(r.avg_death_time),
    patches: r.patches ? num(r.patches) : null,
  }));
}

const champCols: Column[] = [
  { key: "name", label: "Champion", format: "champion" },
  { key: "win_rate", label: "Win rate", format: "pct" },
  { key: "pick_rate", label: "Pick rate", format: "pct" },
  { key: "damage", label: "Damage share", format: "pct" },
  { key: "tank", label: "Damage taken", format: "pct" },
  { key: "kp", label: "Kill part.", format: "pct" },
  { key: "dead", label: "Time dead", format: "sec" },
];

function formatDate(yyyymmdd?: string) {
  if (!yyyymmdd || yyyymmdd.length !== 8) return yyyymmdd ?? "";
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6)}`;
}

export default function ChinaPage() {
  const current = readRepoCsv("data/cn/champions.csv");
  const allTime = readRepoCsv("data/cn/history/all_time.csv");
  const patches = readRepoCsv("data/cn/history/patches.csv");
  const augments = readRepoCsv("data/cn/augments.csv");
  const duos = readRepoJson<Duos>("data/cn/duos.json");

  if (!current) {
    return (
      <>
        <Intro eyebrow="China Stats" title="Mayhem stats from the Chinese servers." />
        <Pending pr={5}>Champion, augment and duo stats appear here once the China data is merged:</Pending>
      </>
    );
  }

  const latest = patches?.at(-1);
  const tabs = [
    {
      id: "champions",
      label: latest ? `Patch ${latest.patch}` : "Current patch",
      content: (
        <DataTable
          columns={champCols}
          rows={champRows(current)}
          initialSort={{ key: "win_rate", desc: true }}
          searchKey="name"
          searchLabel="Find a champion"
        />
      ),
    },
  ];
  if (allTime) {
    tabs.push({
      id: "all-time",
      label: `All time${patches ? ` (${patches.length} patches)` : ""}`,
      content: (
        <DataTable
          columns={[...champCols, { key: "patches", label: "Patches", format: "int" }]}
          rows={champRows(allTime)}
          initialSort={{ key: "win_rate", desc: true }}
          searchKey="name"
          searchLabel="Find a champion"
        />
      ),
    });
  }
  if (augments) {
    tabs.push({
      id: "augments",
      label: "Augments",
      content: (
        <DataTable
          columns={[
            { key: "name", label: "Augment", format: "text" },
            { key: "tier", label: "Tier", format: "text" },
            { key: "win_rate", label: "Win rate", format: "pct" },
            { key: "pick_rate", label: "Pick rate", format: "pct" },
          ]}
          rows={augments.map((a) => ({
            name: names[a.augment_id] ?? a.key.replace(/^ARAM_/, ""),
            tier: a.tier,
            win_rate: num(a.win_rate),
            pick_rate: num(a.pick_rate),
          }))}
          initialSort={{ key: "win_rate", desc: true }}
          searchKey="name"
          searchLabel="Find an augment"
        />
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
          rows={duos.duos.map((d) => ({ a: d.names[0], b: d.names[1], pair: d.names.join(" "), win_rate: d.win_rate, pick_rate: d.pick_rate }))}
          initialSort={{ key: "win_rate", desc: true }}
          searchKey="pair"
          searchLabel="Find a champion"
        />
      ),
    });
  }

  return (
    <>
      <Intro eyebrow="China Stats" title="Mayhem stats from the Chinese servers.">
        From Tencent&apos;s official 101.qq.com. Champions as of {formatDate(duos?.meta.champion_stat_date) || "the latest day"}
        {latest ? `, patch ${latest.patch} since ${latest.window_start}` : ""}. Tencent doesn&apos;t publish game counts,
        so all-time numbers weight each patch by pick rate and days.
      </Intro>
      <SubTabs tabs={tabs} />
    </>
  );
}
