"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import augmentNames from "@/data/augment-names.json";
import type { CompareChampion } from "@/lib/compare";
import { getParam, setParams } from "@/lib/url-state";
import Skeleton from "@/components/Skeleton";
import { LoadError } from "@/components/EmptyState";

// Two champions side by side (/builds?tab=compare&a=Jinx&b=Ezreal). Data comes from /data/compare.json.

type Data = { patch: string | null; champions: CompareChampion[]; items: Record<string, { id: number; name: string; icon?: string }> };
const AUGS = augmentNames as Record<string, string>;

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const pts = (v: number) => `${v > 0 ? "+" : ""}${(v * 100).toFixed(1)} pts`;

// Each stat row: how to read it from a champion, how to show it, and whether higher is better.
const ROWS: { label: string; get: (c: CompareChampion) => number | null; show: (v: number) => string; higher: boolean | null; hint?: string }[] = [
  { label: "Tier rank", get: (c) => c.rank, show: (v) => `#${v}`, higher: false },
  { label: "Win rate", get: (c) => c.winRate, show: pct, higher: true },
  { label: "Pick rate", get: (c) => c.pickRate, show: pct, higher: true },
  { label: "Change since last patch", get: (c) => c.change, show: pts, higher: true },
  { label: "Damage share", get: (c) => c.damage, show: pct, higher: true, hint: "Share of the team's damage to champions." },
  { label: "Damage taken share", get: (c) => c.tank, show: pct, higher: null, hint: "Share of the team's damage taken (neither better nor worse)." },
  { label: "Kill participation", get: (c) => c.kp, show: pct, higher: true },
  { label: "Time dead", get: (c) => c.dead, show: (v) => `${Math.round(v)}s`, higher: false },
  { label: "Simulated damage per second", get: (c) => c.sim?.dps ?? null, show: (v) => Math.round(v).toLocaleString("en-US"), higher: true, hint: "From the Simulator's best build for this champion." },
  { label: "Simulated survival", get: (c) => c.sim?.survival ?? null, show: pct, higher: true, hint: "Share of simulated fights the champion survives." },
];

function Picker({ value, list, onChange, label }: { value: string; list: CompareChampion[]; onChange: (id: string) => void; label: string }) {
  return (
    <label className="compare-pick">
      <span className="sr-only">{label}</span>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/icons/champions/${value}.webp`} alt="" width={40} height={40} />
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
        {list.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function Icons({ ids, kind, items }: { ids: number[]; kind: "augment" | "item"; items: Data["items"] }) {
  if (!ids.length) return <span className="muted-cell">–</span>;
  return (
    <span className="compare-icons">
      {ids.map((id, i) => {
        const name = kind === "augment" ? AUGS[id] : items[id]?.name;
        const src = kind === "augment" ? `/icons/augments/${id}.webp` : items[id]?.icon;
        return (
          <span key={`${id}-${i}`} className="compare-icon" title={name}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {src && <img src={src} alt="" width={28} height={28} loading="lazy" />}
            <span>{name}</span>
          </span>
        );
      })}
    </span>
  );
}

export default function ChampionCompare() {
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  useEffect(() => {
    fetch("/data/compare.json")
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: Data) => {
        const byRank = [...d.champions].filter((c) => c.rank).sort((x, y) => x.rank! - y.rank!);
        const fit = (want: string | null) => d.champions.find((c) => c.id.toLowerCase() === want?.toLowerCase())?.id;
        // Missing sides default to the top-ranked champions, never the same one twice.
        const first = fit(getParam("a")) ?? byRank[0]?.id ?? d.champions[0].id;
        setA(first);
        setB(fit(getParam("b")) ?? (byRank.find((c) => c.id !== first) ?? d.champions.find((c) => c.id !== first))!.id);
        setData(d);
      })
      .catch(() => setFailed(true));
  }, []);

  const pick = (side: "a" | "b", id: string) => {
    (side === "a" ? setA : setB)(id);
    setParams({ [side]: id });
  };
  const swap = () => {
    setA(b);
    setB(a);
    setParams({ a: b, b: a });
  };

  const [ca, cb] = useMemo(() => [data?.champions.find((c) => c.id === a), data?.champions.find((c) => c.id === b)], [data, a, b]);
  if (!data) return failed ? <LoadError what="Compare" /> : <Skeleton kind="cards" rows={2} label="Loading champions…" />;
  if (!ca || !cb) return null;

  const better = (row: (typeof ROWS)[number], mine: CompareChampion, theirs: CompareChampion) => {
    const x = row.get(mine);
    const y = row.get(theirs);
    if (row.higher === null || x === null || y === null || x === y) return "";
    return (row.higher ? x > y : x < y) ? "better" : "";
  };

  return (
    <div className="compare">
      <div className="compare-head">
        <Picker value={a} list={data.champions} onChange={(id) => pick("a", id)} label="First champion" />
        <button type="button" className="btn ghost compare-swap" onClick={swap} aria-label="Swap champions">
          ⇄
        </button>
        <Picker value={b} list={data.champions} onChange={(id) => pick("b", id)} label="Second champion" />
      </div>

      <div className="table-scroll">
        <table className="compare-table">
          <thead>
            <tr>
              <th scope="col">
                <span className="sr-only">Stat</span>
              </th>
              {[ca, cb].map((c) => (
                <th key={c.id} scope="col">
                  <Link href={`/champions/${c.id}`}>{c.name}</Link>{" "}
                  {c.tier && <span className={`chip tier-${c.tier.toLowerCase()}`}>{c.tier}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.label}>
                <th scope="row" title={row.hint}>
                  {row.label}
                </th>
                {[
                  [ca, cb],
                  [cb, ca],
                ].map(([me, them]) => {
                  const v = row.get(me);
                  return (
                    <td key={me.id} className={`num ${better(row, me, them)}`}>
                      {v === null ? "–" : row.show(v)}
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr>
              <th scope="row">Most picked augments</th>
              {[ca, cb].map((c) => (
                <td key={c.id}>
                  <Icons ids={c.augments} kind="augment" items={data.items} />
                </td>
              ))}
            </tr>
            <tr>
              <th scope="row">Core items</th>
              {[ca, cb].map((c) => (
                <td key={c.id}>
                  <Icons ids={c.core?.items ?? []} kind="item" items={data.items} />
                  {c.core && <span className="compare-sub">{pct(c.core.winRate)} win</span>}
                </td>
              ))}
            </tr>
            <tr>
              <th scope="row">Skill max order</th>
              {[ca, cb].map((c) => (
                <td key={c.id} className="compare-skills">
                  {c.skills.length ? c.skills.join(" › ") : "–"}
                </td>
              ))}
            </tr>
            <tr>
              <th scope="row">Simulator&apos;s best build</th>
              {[ca, cb].map((c) => (
                <td key={c.id}>
                  <Icons ids={c.sim?.items ?? []} kind="item" items={data.items} />
                  <Icons ids={c.sim?.augments ?? []} kind="augment" items={data.items} />
                </td>
              ))}
            </tr>
            <tr>
              <th scope="row">Best teammates</th>
              {[ca, cb].map((c) => (
                <td key={c.id}>
                  {c.partners.length
                    ? c.partners.map((p, i) => (
                        <span key={p}>
                          {i > 0 && ", "}
                          <Link className="inline-link" href={`/champions/${p}`}>
                            {data.champions.find((x) => x.id === p)?.name ?? p}
                          </Link>
                        </span>
                      ))
                    : "–"}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="patch-note">Stats are for the live patch{data.patch ? ` (${data.patch})` : ""}. The better value in each row is highlighted.</p>
    </div>
  );
}
