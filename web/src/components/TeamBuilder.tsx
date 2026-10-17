"use client";
/* eslint-disable @next/next/no-img-element -- small local icons */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { SynergyData } from "@/lib/synergy";
import { getParam, setParams } from "@/lib/url-state";
import Skeleton from "@/components/Skeleton";
import { EmptyState, LoadError } from "@/components/EmptyState";
import ArchetypeTags from "@/components/ArchetypeTags";
import { useNames, useT } from "./I18n";

// Team Builder (/builds?tab=team&team=Jinx,Lulu): pick up to five champions to see how each pair does together
// and which champions fit the team best (handy for picking from the ARAM bench). Data: /data/synergy.json.

const MAX = 5;
const pct = (bp: number) => `${(bp / 100).toFixed(1)}%`;
const wrClass = (bp: number) => (bp >= 5200 ? "wr-high" : bp <= 4800 ? "wr-low" : "");

export default function TeamBuilder() {
  const t = useT("builds");
  const names = useNames();
  const [data, setData] = useState<SynergyData | null>(null);
  const [failed, setFailed] = useState(false);
  const [team, setTeam] = useState<string[]>([]);
  useEffect(() => {
    fetch("/data/synergy.json")
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: SynergyData) => {
        const known = new Map(d.champions.map((c) => [c.id.toLowerCase(), c.id]));
        const fromUrl = (getParam("team") ?? "")
          .split(",")
          .map((s) => known.get(s.trim().toLowerCase()))
          .filter((s): s is string => Boolean(s));
        setTeam([...new Set(fromUrl)].slice(0, MAX));
        setData(d);
      })
      .catch(() => setFailed(true));
  }, []);

  const byId = useMemo(() => new Map(data?.champions.map((c) => [c.id, c]) ?? []), [data]);
  const cn = (id: string) => names("champions", id, byId.get(id)?.name ?? id);
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
        const wrs = team.map((m) => data.pairs[c.id]?.[m]).filter((v): v is number => v !== undefined);
        return { c, n: wrs.length, avg: wrs.length ? wrs.reduce((s, v) => s + v, 0) / wrs.length : 0, score: wrs.reduce((s, v) => s + (v - 5000), 0) };
      })
      .filter((f) => f.n > 0)
      .sort((x, y) => y.score - x.score)
      .slice(0, 10);
  }, [team, data]);

  // The team's archetypes: how many of each class, and whether anyone can take hits up front.
  const mix = useMemo(() => {
    const info = data?.tagInfo ?? {};
    const n = new Map<string, number>();
    for (const id of team) for (const tag of byId.get(id)?.tags ?? []) if (info[tag]?.kind === "class") n.set(tag, (n.get(tag) ?? 0) + 1);
    const frontline = n.has("Tank") || n.has("Fighter");
    return { counts: [...n].sort((a, b) => b[1] - a[1]), frontline };
  }, [team, byId, data]);

  if (failed) return <LoadError what={t("Pair data")} />;
  if (!data) return <Skeleton kind="slots" rows={5} label={t("Loading pair data…")} />;

  return (
    <div className="team">
      <div className="team-slots">
        {team.map((id) => (
          <div key={id} className="team-slot">
            <Link href={`/champions/${id}`}>
              <img src={`/icons/champions/${id}.webp`} alt="" width={56} height={56} />
              <span>{cn(id)}</span>
            </Link>
            <button
              type="button"
              className="team-remove"
              aria-label={t("Remove {champ}", { champ: cn(id) })}
              onClick={() => save(team.filter((m) => m !== id))}
            >
              ×
            </button>
          </div>
        ))}
        {team.length < MAX && (
          <label className="team-slot team-add">
            <span className="team-plus" aria-hidden="true">
              +
            </span>
            <select value="" aria-label={t("Add a champion")} onChange={(e) => e.target.value && save([...team, e.target.value])}>
              <option value="">{t("Add a champion")}</option>
              {data.champions
                .filter((c) => !team.includes(c.id))
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {cn(c.id)}
                  </option>
                ))}
            </select>
          </label>
        )}
      </div>
      {team.length > 0 && (
        <button type="button" className="team-clear" onClick={() => save([])}>
          {t("Clear team")}
        </button>
      )}

      {team.length === 0 ? (
        <p className="patch-note">{t("Add the champions on your team, or the one you're playing, to see who pairs best with them.")}</p>
      ) : (
        <div className="bento">
          {data.tagInfo && mix.counts.length > 0 && (
            <div className="team-mix span-all">
              <span className="team-mix-label">{t("Team mix")}</span>
              {mix.counts.map(([tag, k]) => (
                <span key={tag} className="team-mix-item">
                  <ArchetypeTags names={[tag]} info={data.tagInfo} compact />
                  {k > 1 && <b>×{k}</b>}
                </span>
              ))}
              {team.length >= 3 && !mix.frontline && <span className="team-mix-warn">{t("No Tank or Fighter to take hits up front yet.")}</span>}
            </div>
          )}
          {team.length > 1 && (
            <section className="card span-6" data-accent="tier">
              <div className="card-head">
                <h2>{t("Pairs on this team")}</h2>
                {avg !== null && (
                  <span className="card-note">
                    {t("average {wr}", { wr: "\u0000" })
                      .split("\u0000")
                      .map((part, n) =>
                        n
                          ? [
                              <b key="wr" className={wrClass(avg)}>
                                {pct(avg)}
                              </b>,
                              part,
                            ]
                          : part,
                      )}
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
                      {cn(p.a)} + {cn(p.b)}
                    </span>
                    <span className={`rank-v ${p.wr === null ? "muted-cell" : wrClass(p.wr)}`}>{p.wr === null ? "–" : pct(p.wr)}</span>
                  </div>
                ))}
              </div>
              {known.length < pairs.length && <p className="table-note">{t("– means too few games together to rate.")}</p>}
            </section>
          )}
          <section className={`card ${team.length > 1 ? "span-6" : "span-all"}`} data-accent="gold">
            <div className="card-head">
              <h2>
                {team.length === 1
                  ? t("Best teammates for {champ}", { champ: cn(team[0]) })
                  : team.length === MAX
                    ? t("Best fits from the bench")
                    : t("Who fits this team best")}
              </h2>
            </div>
            {fits.length === 0 ? (
              <EmptyState title={t("Not enough games yet.")}>
                {t("These champions haven't played together often enough to rate.")} {t("Try adding someone else.")}
              </EmptyState>
            ) : (
              <div className="rank plain team-fits">
                {fits.map((f) => (
                  <div key={f.c.id}>
                    <img className="icon" src={`/icons/champions/${f.c.id}.webp`} alt="" width={24} height={24} loading="lazy" />
                    <span className="rank-name">
                      {cn(f.c.id)}
                      {team.length > 1 && <span className="team-n"> {t("· with {n} of {total}", { n: f.n, total: team.length })}</span>}
                    </span>
                    <span className={`rank-v ${wrClass(f.avg)}`}>{pct(f.avg)}</span>
                    {team.length < MAX ? (
                      <button
                        type="button"
                        className="team-addbtn"
                        aria-label={t("Add {champ}", { champ: cn(f.c.id) })}
                        onClick={() => save([...team, f.c.id])}
                      >
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
        {t("Win rates are for games where both champions were on the same team, live patch.")}{" "}
        {t("A champion only appears when it has enough games with at least one of your picks.")}
      </p>
    </div>
  );
}
