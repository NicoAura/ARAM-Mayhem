import type { Metadata } from "next";
import { pageMeta } from "@/lib/meta";
import Link from "next/link";
import augmentNames from "@/data/augment-names.json";
import { AdvancedProvider, AdvancedToggle } from "@/components/Advanced";
import ChampionTiers from "@/components/ChampionTiers";
import DataTable from "@/components/DataTable";
import DuosTable from "@/components/DuosTable";
import { hasDuos } from "@/lib/duos";
import { augmentHref } from "@/lib/augments";
import { augmentTiers } from "@/lib/augment-tiers";
import { augmentRows, type RawAugment } from "@/lib/augment-winrate";
import { AUGMENT_DEEPSCORE_HELP } from "@/lib/deepscore";
import championIds from "@/data/champion-ids.json";
import championNames from "@/data/champion-names.json";
import type { PatchRow } from "@/lib/tiers";
import Intro from "@/components/Intro";
import { text } from "@/lib/content";
import Pending from "@/components/Pending";
import SubTabs from "@/components/SubTabs";
import { readRepoCsv, readRepoJson } from "@/lib/repo-data";
import { allChampionTags, championTagData } from "@/lib/champion-tags";

export const metadata: Metadata = pageMeta("/tier-list", "Tier List", "ARAM Mayhem champion tier list for the current patch, with augment and duo win rates.");

const num = (v: string | undefined) => (v === undefined || v === "" ? null : Number(v));
const ALIAS = Object.fromEntries(Object.entries(championIds as Record<string, number>).map(([alias, id]) => [id, alias]));
const NAMES = championNames as Record<string, string>;
type Champs = { champions: { name: string; best_partners?: { champion_id: number }[] }[] };
const names = augmentNames as Record<string, string>;

export default function TierListPage() {
  const byPatch = readRepoCsv("data/cn/history/by_patch.csv");
  const patches = readRepoCsv("data/cn/history/patches.csv");
  const augments = augmentRows<RawAugment & Record<string, string | number | number[]>>();
  const duos = hasDuos();
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
  // Only the live and previous patch ship with the page; ChampionTiers loads the rest when picked.
  const recent = new Set(patches.slice(-2).map((p) => p.patch));
  const rows: PatchRow[] = byPatch.filter((r) => recent.has(r.patch)).map((r) => ({
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
  const tabs: { id: string; label: string; content: React.ReactNode; lazy?: boolean }[] = [
    {
      id: "champions",
      label: "Champions",
      content: (
        <ChampionTiers
          rows={rows}
          patches={patches.map((p) => p.patch)}
          partners={partners}
          tags={allChampionTags([...new Set(rows.map((r) => r.name))])}
          tagInfo={championTagData().info}
        />
      ),
    },
  ];
  if (augments.length) {
    const graded = new Map(augmentTiers().map((a) => [a.id, a]));
    const augName = (a: Record<string, unknown>) => names[String(a.augment_id)] ?? String(a.key).replace(/^ARAM_/, "");
    const augCols = [
      { key: "grade", label: "Tier", format: "tier" as const, sortKey: "deepScore", hint: AUGMENT_DEEPSCORE_HELP },
      { key: "name", label: "Augment", format: "augment" as const, iconKey: "id", hrefKey: "href" },
      { key: "deepScore", label: "DeepScore", format: "deepscore" as const, hint: AUGMENT_DEEPSCORE_HELP },
      { key: "tier", label: "Rarity", format: "tier" as const },
      { key: "win_rate", label: "Win rate", format: "pct" as const },
      { key: "pick_rate", label: "Pick rate", format: "pct" as const },
    ];
    tabs.push({
      id: "augments",
      label: "Augments",
      content: (
        <>
          <p className="patch-note">
            Augments are for the live patch ({latest.patch}). See them as an{" "}
            <Link className="inline-link" href="/augments">
              S to D tier list with style filters
            </Link>
            .
          </p>
          <DataTable
            columns={augCols}
            advancedColumns={[
              ...augCols,
              { key: "lift", label: "Win rate vs its champions", format: "pct" as const, hint: "Win rate minus what the champions who take it win anyway. Above zero means it helps them." },
              { key: "win_rank", label: "Win rank", format: "int" },
              { key: "pick_rank", label: "Pick rank", format: "int" },
              { key: "pick_change", label: "Pick rank change", format: "int" },
              { key: "best", label: "Best champions", format: "text", sortable: false },
            ]}
            rows={augments
              .filter((a) => names[String(a.augment_id)] || a.key)
              .map((a) => ({
                id: Number(a.augment_id),
                href: augmentHref(Number(a.augment_id)),
                name: augName(a),
                tier: String(a.tier ?? ""),
                grade: graded.get(Number(a.augment_id))?.tier ?? null,
                deepScore: graded.get(Number(a.augment_id))?.deepScore ?? null,
                lift: graded.get(Number(a.augment_id))?.lift ?? null,
                win_rate: Number(a.win_rate),
                pick_rate: Number(a.pick_rate),
                win_rank: num(String(a.win_rank ?? "")),
                pick_rank: num(String(a.pick_rank ?? "")),
                pick_change: num(String(a.pick_rank_change ?? "")),
                best: ((a.best_champions as number[]) ?? [])
                  .slice(0, 4)
                  .map((id) => champName(ALIAS[id]))
                  .filter(Boolean)
                  .join(", "),
              }))}
            initialSort={{ key: "deepScore", desc: true }}
            searchKey="name"
            searchLabel="Find an augment"
            urlTab="augments"
          />
        </>
      ),
    });
  }
  if (duos) tabs.push({ id: "duos", label: "Duos", content: <DuosTable />, lazy: true });

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
