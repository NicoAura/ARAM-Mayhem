"use client";
/* eslint-disable @next/next/no-img-element -- small local icons */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { SynergyData } from "@/lib/synergy";
import { getParam, setParams } from "@/lib/url-state";

// Team Builder (/synergy?team=Jinx,Lulu): pick up to five champions to see how each pair does together
// and which champions fit the team best (handy for picking from the ARAM bench). Data: /data/synergy.json.

const MAX = 5;
const pct = (bp: number) => `${(bp / 100).toFixed(1)}%`;
const wrClass = (bp: number) => (bp >= 5200 ? "wr-high" : bp <= 4800 ? "wr-low" : "");

export default function TeamBuilder() {
  const [data, setData] = useState<SynergyData | null>(null);
  const [failed, setFailed] = useState(false);
  const [team, setTeam] = useState<string[]>([]);
  useEffect(() => {
    fetch("/data/synergy.json")
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: SynergyData) => {
        const known = new Map(d.champions.map((c) => [c.id.toLowerCase(), c.id]));
        const fromUrl = (getParam("team") ?? "").split(",").map((s) => known.get(s.trim().toLowerCase())).filter((s): s is string => Boolean(s));
        setTeam([...new Set(fromUrl)].slice(0, MAX));
        setData(d);
      })
      .catch(() => setFailed(true));
  }, []);

  const byId = useMemo(() => new Map(data?.champions.map((c) => [c.id, c]) ?? []), [data]);
  const save = (next: string[]) => {
    setTeam(next);
    setParams({ team: next.length ? next.join(",") : null });
  };

  const pairs = useMemo(() => {
    const out: { a: string; b: string; wr: number | null }[] = [];
    team.forEach((a, i) => team.slice(i + 1).forEach((b) => out.push({ a, b, wr: data?.pairs[a]?.[b] ?? null })));
    return out;
  }, [team, data]);
  const known = pairs.filter((p) => p.wr !== null);
  const avg = known.length ? known.reduce((s, p) => s + p.wr!, 0) / known.length : null;

  // A candidate's fit: how far above even its known pairs with the team are, summed, so a champion that
  // pairs well with more of the team ranks higher. Shown as the average of those pairs.
  const fits = useMemo(() => {
    if (!data || !team.length) return [];
    return data.champions
      .filter((c) => !team.includes(c.id))
      .map((c) => {
        const wrs = team.map((t) => data.pairs[c.id]?.[t]).filter((v): v is number => v !== undefined);
        return { c, n: wrs.length, avg: wrs.length ? wrs.reduce((s, v) => s + v, 0) / wrs.length : 0, score: wrs.reduce((s, v) => s + (v - 5000), 0) };
      })
      .filter((f) => f.n > 0)
      .sort((x, y) => y.score - x.score)
      .slice(0, 10);
  }, [team, data]);

  if (failed) return <p className="table-note">Couldn&apos;t load pair data. Try reloading the page.</p>;
  if (!data) return <p className="table-note">Loading…</p>;

  return (
    <div className="team">
      <div className="team-slots">
        {team.map((id) => (
          <div key={id} className="team-slot">
            <Link href={`/champions/${id}`}>
              <img src={`/icons/champions/${id}.webp`} alt="" width={56} height={56} />
              <span>{byId.get(id)?.name ?? id}</span>
            </Link>
            <button type="button" className="team-remove" aria-label={`Remove ${byId.get(id)?.name ?? id}`} onClick={() => save(team.filter((t) => t !== id))}>
              ×
            </button>
          </div>
        ))}
        {team.length < MAX && (
          <label className="team-slot team-add">
            <span className="team-plus" aria-hidden="true">
              +
            </span>
            <select
              value=""
              aria-label="Add a champion"
              onChange={(e) => e.target.value && save([...team, e.target.value])}
            >
              <option value="">Add a champion</option>
              {data.champions
                .filter((c) => !team.includes(c.id))
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </label>
        )}
      </div>
      {team.length > 0 && (
        <button type="button" className="team-clear" onClick={() => save([])}>
          Clear team
        </button>
      )}

      {team.length === 0 ? (
        <p className="patch-note">Add the champions on your team, or the one you&apos;re playing, to see who pairs best with them.</p>
      ) : (
        <div className="bento">
          {team.length > 1 && (
            <section className="card span-6" data-accent="tier">
              <div className="card-head">
                <h2>Pairs on this team</h2>
                {avg !== null && (
                  <span className="card-note">
                    average <b className={wrClass(avg)}>{pct(avg)}</b>
                  </span>
                )}
              </div>
              <div className="rank plain team-pairs">
                {pairs.map((p) => (
                  <div key={`${p.a}-${p.b}`}>
                    <span className="team-duo">
                      <img src={`/icons/champions/${p.a}.webp`} alt="" width={24} height={24} />
                      <img src={`/icons/champions/${p.b}.webp`} alt="" width={24} height={24} />
                    </span>
                    <span className="rank-name">
                      {byId.get(p.a)?.name} + {byId.get(p.b)?.name}
                    </span>
                    <span className={`rank-v ${p.wr === null ? "muted-cell" : wrClass(p.wr)}`}>{p.wr === null ? "–" : pct(p.wr)}</span>
                  </div>
                ))}
              </div>
              {known.length < pairs.length && <p className="table-note">– means too few games together to rate.</p>}
            </section>
          )}
          <section className={`card ${team.length > 1 ? "span-6" : "span-all"}`} data-accent="gold">
            <div className="card-head">
              <h2>{team.length === 1 ? `Best teammates for ${byId.get(team[0])?.name}` : team.length === MAX ? "Best fits from the bench" : "Who fits this team best"}</h2>
            </div>
            {fits.length === 0 ? (
              <p className="table-note">No pair data for this team yet.</p>
            ) : (
              <div className="rank plain team-fits">
                {fits.map((f) => (
                  <div key={f.c.id}>
                    <img className="icon" src={`/icons/champions/${f.c.id}.webp`} alt="" width={24} height={24} loading="lazy" />
                    <span className="rank-name">
                      {f.c.name}
                      {team.length > 1 && (
                        <span className="team-n">
                          {" "}
                          · with {f.n} of {team.length}
                        </span>
                      )}
                    </span>
                    <span className={`rank-v ${wrClass(f.avg)}`}>{pct(f.avg)}</span>
                    {team.length < MAX ? (
                      <button type="button" className="team-addbtn" aria-label={`Add ${f.c.name}`} onClick={() => save([...team, f.c.id])}>
                        +
                      </button>
                    ) : (
                      <span />
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
      <p className="patch-note">
        Win rates are for games where both champions were on the same team, live patch. A champion only appears when it has enough games
        with at least one of your picks.
      </p>
    </div>
  );
}
