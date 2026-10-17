"use client";
/* eslint-disable @next/next/no-img-element -- small local icons */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { BuildPick, HelperChamp, HelperData } from "@/lib/what-to-build";
import { getParam, setParams } from "@/lib/url-state";
import { LoadError } from "@/components/EmptyState";
import Skeleton from "@/components/Skeleton";

// "What should I build?" (/what-to-build?champ=Jinx&vs=healing,tanky): the build that wins most for a
// champion, its boots, skill order and augments to look for, and item swaps for the enemy team.
// Data: /data/what-to-build.json.

type Data = HelperData & { swaps: Record<string, Record<HelperChamp["kind"], number[]>> };

const THREATS: [string, string][] = [
  ["healing", "Lots of healing"],
  ["tanky", "Tanky enemies"],
  ["ap", "Mostly magic damage"],
  ["ad", "Mostly physical damage"],
  ["cc", "Lots of stuns and slows"],
];
const WHY: Record<string, string> = {
  healing: "cuts their healing",
  tanky: "gets through armor or magic resist",
  ap: "protects you from magic damage",
  ad: "protects you from physical damage",
  cc: "shortens or removes crowd control",
};
const KIND: Record<HelperChamp["kind"], string> = { ad: "physical damage", ap: "magic damage", tank: "tank" };
const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

export default function BuildHelper() {
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);
  const [champ, setChamp] = useState("");
  const [vs, setVs] = useState<string[]>([]);

  useEffect(() => {
    fetch("/data/what-to-build.json")
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: Data) => {
        const want = (getParam("champ") ?? "").toLowerCase();
        setChamp(d.champions.find((c) => c.id.toLowerCase() === want)?.id ?? "");
        setVs((getParam("vs") ?? "").split(",").filter((t) => THREATS.some(([k]) => k === t)));
        setData(d);
      })
      .catch(() => setFailed(true));
  }, []);

  const c = useMemo(() => data?.champions.find((x) => x.id === champ) ?? null, [data, champ]);
  const pickChamp = (id: string) => {
    setChamp(id);
    setParams({ champ: id || null });
  };
  const toggle = (t: string) => {
    const next = vs.includes(t) ? vs.filter((x) => x !== t) : [...vs, t];
    setVs(next);
    setParams({ vs: next.length ? next.join(",") : null });
  };

  if (failed) return <LoadError what="Build suggestions" />;
  if (!data) return <Skeleton kind="cards" rows={3} label="Loading builds…" />;

  const item = (id: number) => data.items[id];
  const Items = ({ ids }: { ids: number[] }) => (
    <div className="helper-items">
      {ids.map((id, i) => (
        <span key={`${id}-${i}`} className="helper-item" title={item(id)?.[0]}>
          {item(id)?.[1] ? <img src={item(id)[1]} alt="" width={44} height={44} /> : null}
          <span>{item(id)?.[0] ?? `Item ${id}`}</span>
        </span>
      ))}
    </div>
  );
  const Stats = ({ b }: { b: BuildPick }) => (
    <span className="card-note">
      {b.winRate !== null && (
        <>
          <b className={b.winRate >= 0.52 ? "wr-high" : b.winRate <= 0.48 ? "wr-low" : ""}>{pct(b.winRate)}</b> win ·{" "}
        </>
      )}
      {pct(b.pickRate)} of games
    </span>
  );

  // For each chosen threat, the first situational item the build doesn't already have.
  const swaps = c
    ? vs.flatMap((t) => {
        const have = new Set(c.best?.items ?? []);
        const id = (data.swaps[t]?.[c.kind] ?? []).find((i) => !have.has(i) && item(i));
        return id ? [{ t, id }] : [];
      })
    : [];

  const covered = vs.filter((t) => !swaps.some((x) => x.t === t));

  return (
    <div className="helper">
      <div className="helper-pick">
        <label className="builder-champ">
          {c && <img src={`/icons/champions/${c.id}.webp`} alt="" width={40} height={40} />}
          <select value={champ} aria-label="Champion" onChange={(e) => pickChamp(e.target.value)}>
            <option value="">Pick your champion</option>
            {data.champions.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
        <div className="helper-threats" role="group" aria-label="The enemy team has">
          <span>Enemy team has:</span>
          {THREATS.map(([k, l]) => (
            <button key={k} type="button" className="chip-toggle" aria-pressed={vs.includes(k)} onClick={() => toggle(k)}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {!c ? (
        <p className="patch-note">Pick the champion you&apos;re playing to see what to build. Add what the enemy team has to get item swaps.</p>
      ) : (
        <div className="bento">
          {c.best && (
            <section className="card span-7" data-accent="tier">
              <div className="card-head">
                <h2>Build this</h2>
                <Stats b={c.best} />
              </div>
              <Items ids={c.best.items} />
              <p className="table-note">The full build that wins most often for {c.name} among builds players commonly use.</p>
            </section>
          )}
          <section className="card span-5" data-accent="gold">
            <div className="card-head">
              <h2>Against this team</h2>
            </div>
            {swaps.length ? (
              <div className="helper-swaps">
                {swaps.map(({ t, id }) => (
                  <div key={t}>
                    {item(id)?.[1] && <img src={item(id)[1]} alt="" width={36} height={36} />}
                    <span>
                      <b>{item(id)?.[0]}</b>
                      <small>{WHY[t]}</small>
                    </span>
                  </div>
                ))}
                <p className="table-note">
                  Swap one of these in for the last item of the build.
                  {covered.length > 0 && ` The build already ${covered.map((t) => WHY[t]).join(" and ")}.`}
                </p>
              </div>
            ) : (
              <p className="table-note">
                {vs.length ? "This build already covers it." : "Pick what the enemy team has above to get swaps."} {c.name} builds {KIND[c.kind]}.
              </p>
            )}
          </section>
          {c.popular && (
            <section className="card span-7" data-accent="tier">
              <div className="card-head">
                <h2>Most popular build</h2>
                <Stats b={c.popular} />
              </div>
              <Items ids={c.popular.items} />
            </section>
          )}
          <section className="card span-5" data-accent="sim">
            <div className="card-head">
              <h2>Boots and skills</h2>
            </div>
            {c.boots && <Items ids={c.boots.items} />}
            {c.skills.length > 0 && (
              <p className="helper-skills">
                Max {c.skills.map((s, i) => (
                  <span key={s}>
                    {i > 0 && " → "}
                    <b className="chip">{s}</b>
                  </span>
                ))}
              </p>
            )}
          </section>
          <section className="card span-all" data-accent="gold">
            <div className="card-head">
              <h2>Augments to look for</h2>
              <Link href={`/draft?champ=${c.id}`}>Practice a draft →</Link>
            </div>
            <div className="helper-augs">
              {(["prismatic", "gold", "silver"] as const).map((r) =>
                c.augs[r]?.length ? (
                  <div key={r}>
                    <span className={`chip tier-${r}`}>{r[0].toUpperCase() + r.slice(1)}</span>
                    {c.augs[r].map((a) => (
                      <span key={a} className="helper-aug">
                        <img src={`/icons/augments/${a}.webp`} alt="" width={28} height={28} />
                        {data.augs[a]}
                      </span>
                    ))}
                  </div>
                ) : null,
              )}
            </div>
          </section>
          <p className="patch-note span-all">
            From live-patch games. See more on{" "}
            <Link className="inline-link" href={`/champions/${c.id}`}>
              {c.name}&apos;s page
            </Link>{" "}
            or try your own build in the{" "}
            <Link className="inline-link" href={`/builder?champ=${c.id}`}>
              Build Editor
            </Link>
            .
          </p>
        </div>
      )}
    </div>
  );
}
