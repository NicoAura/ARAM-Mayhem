"use client";

import { useEffect, useState } from "react";

// On the account page, for the connected Riot account: ranked standing, challenge standing, mastery
// against this patch's Mayhem tiers, the title and challenge tokens they show in the client, and the
// player's ARAM Clash team (/api/account/riot).

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
type Ranked = { queueType: string; tier: string; rank: string; leaguePoints: number; wins: number; losses: number };
type Extras = {
  connected: boolean;
  ranked: Ranked[];
  mastery: Mastery[];
  challenges: {
    total: { level: string; percentile: number } | null;
    aram: { level: string; percentile: number } | null;
    tokens?: { id: number; name: string; description: string; level: string }[];
    title?: string | null;
  } | null;
  clash: { name: string; abbreviation: string; tier: number; members: Member[] } | null;
};
type Tiers = Record<number, { id: string; name: string; tier: string | null; winRate: number | null }>;

const STRONG = new Set(["S", "A"]);
const QUEUES: Record<string, string> = { RANKED_SOLO_5x5: "Solo/Duo", RANKED_FLEX_SR: "Flex" };
const title = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();
const top = (p: number) => `Top ${p * 100 < 1 ? (p * 100).toFixed(1) : Math.max(1, Math.round(p * 100))}%`;
const icon = (alias: string) => `/icons/champions/${alias}.webp`;

export default function PlayerExtras() {
  const [extras, setExtras] = useState<Extras | null>(null);
  const [tiers, setTiers] = useState<Tiers>({});

  useEffect(() => {
    let live = true;
    fetch("/api/account/riot", { cache: "no-store" })
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
  }, []);

  if (!extras?.connected) return null;
  const champ = (id: number) => tiers[id] ?? { id: "", name: `Champion ${id}`, tier: null, winRate: null };
  const { challenges, mastery, clash } = extras;
  const ranked = (extras.ranked ?? []).filter((r) => QUEUES[r.queueType]);

  return (
    <section className="card acct-riot">
      {ranked.length > 0 && (
        <dl className="acct-ranks">
          {ranked.map((r) => (
            <div key={r.queueType} className="rank-badge">
              <dt>{QUEUES[r.queueType]}</dt>
              <dd>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/assets/ranked/${r.tier.toLowerCase()}.png`} alt="" width={40} height={40} />
                {title(r.tier)} {["MASTER", "GRANDMASTER", "CHALLENGER"].includes(r.tier) ? "" : r.rank} · {r.leaguePoints} LP
                <span>
                  {r.wins}W {r.losses}L
                </span>
              </dd>
            </div>
          ))}
        </dl>
      )}
      {challenges && (challenges.total || challenges.aram) && (
        <dl className="acct-ranks">
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

      {challenges && (challenges.title || challenges.tokens?.length) ? (
        <div className="player-extra">
          <h3>Your profile in the client</h3>
          {challenges.title && (
            <p className="acct-title">
              Title: <strong>{challenges.title}</strong>
            </p>
          )}
          {challenges.tokens?.length ? (
            <ul className="acct-tokens">
              {challenges.tokens.map((t) => (
                <li key={t.id} title={t.description}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/assets/challenge/${t.id}-${t.level}.png`} alt="" width={48} height={48} loading="lazy" />
                  <span className="name">{t.name}</span>
                  <span className="lvl">{title(t.level)}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {mastery.length > 0 && (
        <div className="player-extra">
          <h3>Mastery and this patch&apos;s Mayhem tier</h3>
          <p className="acct-hint">Your highest-mastery champions. Highlighted ones are S or A tier in Mayhem right now.</p>
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
    </section>
  );
}
