"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { loadSettings } from "@/lib/settings";
import { getParam, setParams } from "@/lib/url-state";
import DataTable, { type Column } from "./DataTable";
import { champStats, TIER_HELP, type PatchRow } from "@/lib/tiers";
import Skeleton from "@/components/Skeleton";

// Champion tier list over a chosen patch range: the live patch (default), any set of patches, or all time.
// The page carries only the live and previous patch; older patches load from /data/tier-history.json when picked.

const TIER: Column = { key: "tier", label: "Tier", format: "tier", sortKey: "score", hint: TIER_HELP };
const DEEP: Column = { key: "deepScore", label: "DeepScore", format: "deepscore", sortKey: "score", hint: TIER_HELP };
const NAME: Column = { key: "name", label: "Champion", format: "champion" };
const PATCHES: Column = { key: "patches", label: "Patches", format: "int" };

const CHANGE: Column = { key: "change", label: "Change", format: "pct", hint: "Win rate change since the previous patch, in percentage points." };

const STANDARD: Column[] = [
  TIER,
  NAME,
  DEEP,
  { key: "win_rate", label: "Win rate", format: "pct" },
  { key: "pick_rate", label: "Pick rate", format: "pct" },
];

const ADVANCED: Column[] = [
  TIER,
  NAME,
  DEEP,
  { key: "score", label: "Confident win rate", format: "pct", hint: "The low end of the win rate's likely range, after allowing for how many games there are. DeepScore ranks on this." },
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

const MOVERS = { key: "change", desc: true };
const BEST = { key: "score", desc: true };

export default function ChampionTiers({ rows: initial, patches, partners }: { rows: PatchRow[]; patches: string[]; partners: Record<string, string> }) {
  const live = patches[patches.length - 1];
  const [rows, setRows] = useState(initial);
  const [full, setFull] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(() => new Set([live]));
  // Opening sort; the Biggest movers button swaps it (and remounts the table to apply it).
  const [sort, setSort] = useState(BEST);
  // The starting range is ?patches= from a shared link, else a setting (gear menu); picking patches here doesn't change the setting.
  useEffect(() => {
    const fromUrl = getParam("patches");
    const listed = fromUrl === "all" ? patches : (fromUrl?.split(",").filter((p) => patches.includes(p)) ?? []);
    if (listed.length) return setPicked(new Set(listed));
    const r = loadSettings().tierRange;
    if (r === "last3") setPicked(new Set(patches.slice(-3)));
    else if (r === "all") setPicked(new Set(patches));
  }, [patches]);

  const have = useMemo(() => new Set(rows.map((r) => r.patch)), [rows]);
  const missing = [...picked].some((p) => !have.has(p));
  useEffect(() => {
    if (!missing || full) return;
    setFull(true);
    fetch("/data/tier-history.json")
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((all: PatchRow[]) => setRows(all))
      .catch(() => setFull(false));
  }, [missing, full]);

  // Win rate change since the patch before, when one patch is picked.
  const one = picked.size === 1 ? [...picked][0] : null;
  const before = one ? patches[patches.indexOf(one) - 1] : undefined;
  const stats = useMemo(() => {
    if (missing) return [];
    const prev = before && have.has(before) ? new Map(champStats(rows, new Set([before])).map((c) => [c.name, c.win_rate])) : null;
    return champStats(rows, picked).map((c) => {
      const was = prev?.get(c.name);
      return { ...c, partners: partners[c.name] ?? null, change: was === undefined ? null : c.win_rate - was };
    });
  }, [rows, picked, partners, before, have, missing]);

  const choose = (next: Set<string>) => {
    setPicked(next);
    const list = [...next];
    setParams({ patches: list.length === 1 && list[0] === live ? null : list.length === patches.length ? "all" : list.join(",") });
  };
  const preset = (list: string[]) => {
    choose(new Set(list));
    if (sort !== BEST) {
      setSort(BEST);
      setParams({ sort: null });
    }
  };
  const same = (list: string[]) => list.length === picked.size && list.every((p) => picked.has(p));
  const toggle = (p: string) => {
    const next = new Set(picked);
    if (next.has(p) && next.size > 1) next.delete(p);
    else next.add(p);
    choose(next);
  };
  const movers = () => {
    choose(new Set([live]));
    setSort(MOVERS);
    setParams({ sort: "change.desc" });
  };
  // A shared link or the home page's "All changes" can open the movers view directly.
  useEffect(() => {
    if (getParam("sort") === "change.desc" && !getParam("tab")) setSort(MOVERS);
  }, []);

  // Timeline: a slider over the patches, one patch at a time, with a play button that steps forward.
  const [playing, setPlaying] = useState(false);
  const at = one ? patches.indexOf(one) : patches.length - 1;
  const atRef = useRef(at);
  atRef.current = at;
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => {
      const next = atRef.current + 1;
      if (next >= patches.length) return setPlaying(false);
      choose(new Set([patches[next]]));
    }, 1400);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- choose only sets state and the URL
  }, [playing, patches]);
  const play = () => {
    if (playing) return setPlaying(false);
    // From the end, start over from the first patch.
    if (at >= patches.length - 1 || !one) choose(new Set([patches[0]]));
    setPlaying(true);
  };

  const presets: [string, string[]][] = [
    [`Live patch (${live})`, [live]],
    ["Last 3 patches", patches.slice(-3)],
    ["All time", patches],
  ];
  const showMulti = picked.size > 1;
  const showChange = !showMulti && Boolean(before);
  const moversOn = sort === MOVERS && same([live]);

  return (
    <div className="patch-range">
      <div className="patch-presets" role="group" aria-label="Patch range">
        {presets.map(([label, list]) => (
          <button key={label} type="button" aria-pressed={same(list) && !moversOn} onClick={() => preset(list)}>
            {label}
          </button>
        ))}
        {patches.length > 1 && (
          <button type="button" aria-pressed={moversOn} onClick={movers}>
            Biggest movers
          </button>
        )}
      </div>
      {patches.length > 2 && (
        <div className="patch-timeline">
          <button type="button" className="timeline-play" aria-label={playing ? "Pause timeline" : "Play through every patch"} aria-pressed={playing} onClick={play}>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
              {playing ? <path d="M7 5h4v14H7zM13 5h4v14h-4z" /> : <path d="M8 5v14l11-7z" />}
            </svg>
          </button>
          <input
            type="range"
            min={0}
            max={patches.length - 1}
            step={1}
            value={at}
            aria-label="Patch"
            aria-valuetext={`Patch ${patches[at]}`}
            onChange={(e) => {
              setPlaying(false);
              choose(new Set([patches[Number(e.target.value)]]));
            }}
            style={{ "--fill": `${(at / (patches.length - 1)) * 100}%` } as React.CSSProperties}
          />
          <output className="timeline-label">{one ? `Patch ${one}` : `${picked.size} patches`}</output>
        </div>
      )}
      <div className="patch-chips" role="group" aria-label="Patches">
        {[...patches].reverse().map((p) => (
          <button key={p} type="button" aria-pressed={picked.has(p)} onClick={() => toggle(p)}>
            {p}
          </button>
        ))}
      </div>
      <p className="patch-note">
        {picked.size === 1 ? `Patch ${[...picked][0]}` : `${picked.size} patches combined`}
        {showChange ? `, with the change since ${before}` : ""}. Click patches to add or remove them.
      </p>
      {missing ? (
        <Skeleton rows={12} label="Loading older patches…" />
      ) : (
        <DataTable
          key={sort.key}
          columns={showMulti ? [...STANDARD, PATCHES] : showChange ? [...STANDARD, CHANGE] : STANDARD}
          advancedColumns={showMulti ? [...ADVANCED, PATCHES] : showChange ? [...ADVANCED, CHANGE] : ADVANCED}
          rows={stats}
          initialSort={sort}
          searchKey="name"
          searchLabel="Find a champion"
          urlTab=""
          favorites
        />
      )}
    </div>
  );
}
