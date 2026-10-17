"use client";

import { useEffect, useState } from "react";

// Under the My Stats account card: challenge standing, mastery against this patch's Mayhem tiers,
// and the player's ARAM Clash team. Loaded after the Riot ID lookup.

type Mastery = { championId: number; championLevel: number; championPoints: number };
type Member = {
  gameName: string | null;
  tagLine: string | null;
  position: string;
  role: string;
  top: Mastery[];
  page: string | null;
  mayhem: { championId: number; games: number; wins: number }[];
};
type Extras = {
  mastery: Mastery[];
  challenges: { total: { level: string; percentile: number } | null; aram: { level: string; percentile: number } | null } | null;
  clash: { name: string; abbreviation: string; tier: number; members: Member[] } | null;
};
type Tiers = Record<number, { id: string; name: string; tier: string | null; winRate: number | null }>;

const STRONG = new Set(["S", "A"]);
const title = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();
const top = (p: number) => `Top ${p * 100 < 1 ? (p * 100).toFixed(1) : Math.max(1, Math.round(p * 100))}%`;
const icon = (alias: string) => `/icons/champions/${alias}.webp`;

export default function PlayerExtras({ puuid, platform }: { puuid: string; platform: string }) {
  const [extras, setExtras] = useState<Extras | null>(null);
  const [tiers, setTiers] = useState<Tiers>({});

  useEffect(() => {
    let live = true;
    setExtras(null);
    fetch(`/api/riot/player?${new URLSearchParams({ puuid, platform })}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => live && d && setExtras(d))
      .catch(() => {});
    fetch("/data/champion-tiers.json")
      .then((r) => r.json())
      .then((d) => live && setTiers(d))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [puuid, platform]);

  if (!extras) return null;
  const champ = (id: number) => tiers[id] ?? { id: "", name: `Champion ${id}`, tier: null, winRate: null };
  const { challenges, mastery, clash } = extras;

  return (
    <>
      {challenges && (challenges.total || challenges.aram) && (
        <dl className="riot-id-ranks">
          {challenges.total && (
            <div>
              <dt>Challenges</dt>
              <dd>
                {title(challenges.total.level)}
                <span>{top(challenges.total.percentile)}</span>
              </dd>
            </div>
          )}
          {challenges.aram && (
            <div>
              <dt>ARAM challenges</dt>
              <dd>
                {title(challenges.aram.level)}
                <span>{top(challenges.aram.percentile)}</span>
              </dd>
            </div>
          )}
        </dl>
      )}

      {mastery.length > 0 && (
        <div className="player-extra">
          <h3>Mastery and this patch&apos;s Mayhem tier</h3>
          <p className="riot-id-note">Your highest-mastery champions. Highlighted ones are S or A tier in Mayhem right now.</p>
          <ul className="mastery-list">
            {mastery.map((m) => {
              const c = champ(m.championId);
              return (
                <li key={m.championId} className={c.tier && STRONG.has(c.tier) ? "strong" : undefined}>
                  {c.id && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={icon(c.id)} alt="" width={32} height={32} />
                  )}
                  <span className="name">{c.id ? <a href={`/champions/${c.id}`}>{c.name}</a> : c.name}</span>
                  <span className="pts">
                    Level {m.championLevel} · {m.championPoints.toLocaleString()} pts
                  </span>
                  <span className={`chip tier-${(c.tier ?? "none").toLowerCase()}`}>{c.tier ?? "–"}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {clash && (
        <div className="player-extra">
          <h3>
            ARAM Clash team: {clash.name} <span>[{clash.abbreviation}] · Tier {clash.tier}</span>
          </h3>
          <ul className="clash-roster">
            {clash.members.map((m, i) => {
              const best = m.mayhem.length
                ? m.mayhem.map((c) => `${champ(c.championId).name} (${c.games} games, ${Math.round((100 * c.wins) / Math.max(1, c.games))}%)`)
                : m.top.map((c) => `${champ(c.championId).name}${champ(c.championId).tier ? ` (${champ(c.championId).tier} tier)` : ""}`);
              const who = m.gameName ? `${m.gameName}#${m.tagLine}` : "Teammate";
              return (
                <li key={i}>
                  <span className="name">
                    {m.page ? <a href={m.page}>{who}</a> : who}
                    {m.role === "CAPTAIN" && <span> · Captain</span>}
                  </span>
                  <span className="best">
                    {best.length ? `${m.mayhem.length ? "Most-played Mayhem" : "Best mastery"}: ${best.join(", ")}` : ""}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </>
  );
}
