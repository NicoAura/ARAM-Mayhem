"use client";

import { useEffect, useState } from "react";
import { useNames, useT } from "./I18n";

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
// Ranked tiers and challenge levels, as words ("GOLD" → "Gold"); they are also translation keys.
const title = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();
const pct = (p: number) => (p * 100 < 1 ? (p * 100).toFixed(1) : String(Math.max(1, Math.round(p * 100))));
const icon = (alias: string) => `/icons/champions/${alias}.webp`;

export default function PlayerExtras() {
  const [extras, setExtras] = useState<Extras | null>(null);
  const [tiers, setTiers] = useState<Tiers>({});
  const t = useT("account");
  const names = useNames();

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
  const champ = (id: number) => {
    const c = tiers[id] ?? { id: "", name: t("Champion {id}", { id }), tier: null, winRate: null };
    return c.id ? { ...c, name: names("champions", c.id, c.name) } : c;
  };
  const level = (s: string) => t(title(s));
  const top = (p: number) => t("Top {pct}%", { pct: pct(p) });
  const { challenges, mastery, clash } = extras;
  const ranked = (extras.ranked ?? []).filter((r) => QUEUES[r.queueType]);

  return (
    <section className="card acct-riot">
      {ranked.length > 0 && (
        <dl className="acct-ranks">
          {ranked.map((r) => (
            <div key={r.queueType} className="rank-badge">
              <dt>{t(QUEUES[r.queueType])}</dt>
              <dd>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/assets/ranked/${r.tier.toLowerCase()}.png`} alt="" width={40} height={40} />
                {level(r.tier)} {["MASTER", "GRANDMASTER", "CHALLENGER"].includes(r.tier) ? "" : r.rank} · {t("{n} LP", { n: r.leaguePoints })}
                <span>{t("{wins}W {losses}L", { wins: r.wins, losses: r.losses })}</span>
              </dd>
            </div>
          ))}
        </dl>
      )}
      {challenges && (challenges.total || challenges.aram) && (
        <dl className="acct-ranks">
          {challenges.total && (
            <div>
              <dt>{t("Challenges")}</dt>
              <dd>
                {level(challenges.total.level)}
                <span>{top(challenges.total.percentile)}</span>
              </dd>
            </div>
          )}
          {challenges.aram && (
            <div>
              <dt>{t("ARAM challenges")}</dt>
              <dd>
                {level(challenges.aram.level)}
                <span>{top(challenges.aram.percentile)}</span>
              </dd>
            </div>
          )}
        </dl>
      )}

      {challenges && (challenges.title || challenges.tokens?.length) ? (
        <div className="player-extra">
          <h3>{t("Your profile in the client")}</h3>
          {challenges.title && (
            <p className="acct-title">
              {t("Title:")} <strong>{challenges.title}</strong>
            </p>
          )}
          {challenges.tokens?.length ? (
            <ul className="acct-tokens">
              {challenges.tokens.map((tok) => (
                <li key={tok.id} title={tok.description}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/assets/challenge/${tok.id}-${tok.level}.png`} alt="" width={48} height={48} loading="lazy" />
                  <span className="name">{tok.name}</span>
                  <span className="lvl">{level(tok.level)}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {mastery.length > 0 && (
        <div className="player-extra">
          <h3>{t("Mastery and this patch's Mayhem tier")}</h3>
          <p className="acct-hint">{t("Your highest-mastery champions. Highlighted ones are S or A tier in Mayhem right now.")}</p>
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
                    {t("Level {level} · {points} pts", { level: m.championLevel, points: m.championPoints.toLocaleString() })}
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
            {t("ARAM Clash team: {name}", { name: clash.name })} <span>[{clash.abbreviation}] · {t("Tier {n}", { n: clash.tier })}</span>
          </h3>
          <ul className="clash-roster">
            {clash.members.map((m, i) => {
              const best = m.mayhem.length
                ? m.mayhem.map((c) => t("{name} ({games} games, {pct}%)", { name: champ(c.championId).name, games: c.games, pct: Math.round((100 * c.wins) / Math.max(1, c.games)) }))
                : m.top.map((c) => (champ(c.championId).tier ? t("{name} ({tier} tier)", { name: champ(c.championId).name, tier: champ(c.championId).tier! }) : champ(c.championId).name));
              const who = m.gameName ? `${m.gameName}#${m.tagLine}` : t("Teammate");
              return (
                <li key={i}>
                  <span className="name">
                    {m.page ? <a href={m.page}>{who}</a> : who}
                    {m.role === "CAPTAIN" && <span> · {t("Captain")}</span>}
                  </span>
                  <span className="best">
                    {best.length ? `${m.mayhem.length ? t("Most-played Mayhem") : t("Best mastery")}: ${best.join(", ")}` : ""}
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
