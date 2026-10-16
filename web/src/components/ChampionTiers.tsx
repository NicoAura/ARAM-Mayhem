"use client";

import { useEffect, useMemo, useState } from "react";
import { loadSettings } from "@/lib/settings";
import DataTable, { type Column } from "./DataTable";
import { champStats, TIER_HELP, type PatchRow } from "@/lib/tiers";

// Champion tier list over a chosen patch range: the live patch (default), any set of patches, or all time.

const TIER: Column = { key: "tier", label: "Tier", format: "tier", sortKey: "score", hint: TIER_HELP };
const NAME: Column = { key: "name", label: "Champion", format: "champion" };
const PATCHES: Column = { key: "patches", label: "Patches", format: "int" };

const STANDARD: Column[] = [
  TIER,
  NAME,
  { key: "win_rate", label: "Win rate", format: "pct" },
  { key: "pick_rate", label: "Pick rate", format: "pct" },
];

const ADVANCED: Column[] = [
  TIER,
  NAME,
  { key: "score", label: "Bayesian win rate", format: "pct", hint: TIER_HELP },
  { key: "win_rate", label: "Raw win rate", format: "pct" },
  { key: "pick_rate", label: "Pick rate", format: "pct" },
  { key: "share", label: "Game share", format: "pct", hint: "Estimated share of all games in the chosen patches, from pick rate and days." },
  { key: "damage", label: "Damage share", format: "pct" },
  { key: "tank", label: "Damage taken", format: "pct" },
  { key: "kp", label: "Kill part.", format: "pct" },
  { key: "dead", label: "Time dead", format: "sec" },
  { key: "top_augments", label: "Top augments", format: "text", sortable: false },
  { key: "partners", label: "Best partners (live)", format: "text", sortable: false },
];

export default function ChampionTiers({ rows, patches, partners }: { rows: PatchRow[]; patches: string[]; partners: Record<string, string> }) {
  const live = patches.at(-1)!;
  const [picked, setPicked] = useState<Set<string>>(() => new Set([live]));
  // The starting range is a setting (gear menu); picking patches here doesn't change it.
  useEffect(() => {
    const r = loadSettings().tierRange;
    if (r === "last3") setPicked(new Set(patches.slice(-3)));
    else if (r === "all") setPicked(new Set(patches));
  }, [patches]);
  const stats = useMemo(() => champStats(rows, picked).map((c) => ({ ...c, partners: partners[c.name] ?? null })), [rows, picked, partners]);

  const preset = (list: string[]) => setPicked(new Set(list));
  const same = (list: string[]) => list.length === picked.size && list.every((p) => picked.has(p));
  const toggle = (p: string) =>
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(p) && next.size > 1) next.delete(p);
      else next.add(p);
      return next;
    });

  const presets: [string, string[]][] = [
    [`Live patch (${live})`, [live]],
    ["Last 3 patches", patches.slice(-3)],
    ["All time", patches],
  ];
  const showMulti = picked.size > 1;

  return (
    <div className="patch-range">
      <div className="patch-presets" role="group" aria-label="Patch range">
        {presets.map(([label, list]) => (
          <button key={label} type="button" aria-pressed={same(list)} onClick={() => preset(list)}>
            {label}
          </button>
        ))}
      </div>
      <div className="patch-chips" role="group" aria-label="Patches">
        {[...patches].reverse().map((p) => (
          <button key={p} type="button" aria-pressed={picked.has(p)} onClick={() => toggle(p)}>
            {p}
          </button>
        ))}
      </div>
      <p className="patch-note">
        {picked.size === 1 ? `Patch ${[...picked][0]}` : `${picked.size} patches combined`}. Click patches to add or remove them.
      </p>
      <DataTable
        columns={showMulti ? [...STANDARD, PATCHES] : STANDARD}
        advancedColumns={showMulti ? [...ADVANCED, PATCHES] : ADVANCED}
        rows={stats}
        initialSort={{ key: "score", desc: true }}
        searchKey="name"
        searchLabel="Find a champion"
        urlTab=""
      />
    </div>
  );
}
