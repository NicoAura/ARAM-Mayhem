import type { Metadata } from "next";
import Link from "next/link";
import FavoriteStar from "@/components/FavoriteStar";
import { notFound } from "next/navigation";
import Embed from "@/components/Embed";
import { augmentHref } from "@/lib/augments";
import { championAliases, championSummary } from "@/lib/champions";
import { pageMeta } from "@/lib/meta";
import { discoverToolTabs } from "@/lib/tabs";

// One page per champion, so each can be found in search: a server-rendered summary of the live
// patch (tier, rates, change, top augments, partners), then the full champion page from champions/.

export const dynamicParams = false;
export const generateStaticParams = () => championAliases().map((alias) => ({ alias }));

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const pts = (v: number) => `${v > 0 ? "+" : ""}${(v * 100).toFixed(1)} pts`;

export async function generateMetadata({ params }: { params: Promise<{ alias: string }> }): Promise<Metadata> {
  const c = championSummary((await params).alias);
  if (!c) return {};
  const stats = c.winRate !== undefined ? ` ${c.tier} tier, ${pct(c.winRate)} win rate on patch ${c.patch}.` : "";
  const augs = c.augments.length ? ` Best augments: ${c.augments.map((a) => a.name).join(", ")}.` : "";
  const meta = pageMeta(`/champions/${c.alias}`, `${c.name} ARAM Mayhem Build & Augments`, `${c.name} in ARAM Mayhem:${stats}${augs}`);
  if (c.splash) {
    const image = { url: c.splash, width: 1215, height: 717, alt: c.name };
    meta.openGraph = { ...meta.openGraph, images: [image] };
    meta.twitter = { ...meta.twitter, images: [c.splash] };
  }
  return meta;
}

export default async function ChampionPage({ params }: { params: Promise<{ alias: string }> }) {
  const c = championSummary((await params).alias);
  const tab = discoverToolTabs().find((t) => t.href === "/champions");
  if (!c) notFound();
  return (
    <>
      <section className="champ-hero" style={c.splash ? ({ "--splash": `url("${c.splash}")` } as React.CSSProperties) : undefined}>
        <p className="eyebrow">
          <Link href="/tier-list">Tier List</Link> · Patch {c.patch}
        </p>
        <h1>
          {c.name} <span className="champ-hero-sub">ARAM Mayhem build</span>
        </h1>
        {c.title && <p className="lede">{c.title.charAt(0).toUpperCase() + c.title.slice(1)}</p>}
        <p className="champ-hero-links">
          <FavoriteStar id={c.alias} name={c.name} label />
          <Link className="inline-link" href={`/compare?a=${c.alias}`}>
            Compare with another champion
          </Link>
        </p>
        {c.winRate !== undefined && (
          <div className="stat-row">
            <div>
              <b>
                <span className={`chip tier-${c.tier?.toLowerCase()}`}>{c.tier}</span>
              </b>
              <span>
                tier, #{c.rank} of {c.of}
              </span>
            </div>
            <div>
              <b className={c.winRate >= 0.52 ? "wr-high" : c.winRate <= 0.48 ? "wr-low" : ""}>{pct(c.winRate)}</b>
              <span>win rate</span>
            </div>
            <div>
              <b>{pct(c.pickRate ?? 0)}</b>
              <span>pick rate</span>
            </div>
            {c.change !== null && (
              <div>
                <b className={c.change > 0 ? "delta-up" : c.change < 0 ? "delta-down" : ""}>{pts(c.change)}</b>
                <span>since {c.prev}</span>
              </div>
            )}
          </div>
        )}
      </section>
      {(c.augments.length > 0 || c.partners.length > 0) && (
        <div className="bento">
          {c.augments.length > 0 && (
            <section className="card span-7" data-accent="gold">
              <div className="card-head">
                <h2>Most picked augments</h2>
              </div>
              <div className="rank">
                {c.augments.map((a, i) => (
                  <Link key={a.id} href={augmentHref(a.id) ?? `/tier-list?tab=augments&q=${encodeURIComponent(a.name)}`}>
                    <span className="rank-i">{i + 1}</span>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img className="icon" src={`/icons/augments/${a.id}.webp`} alt="" width={24} height={24} loading="lazy" />
                    <span className="rank-name">{a.name}</span>
                  </Link>
                ))}
              </div>
            </section>
          )}
          {c.partners.length > 0 && (
            <section className="card span-5" data-accent="tier">
              <div className="card-head">
                <h2>Best teammates</h2>
                <Link href={`/synergy?team=${c.alias}`}>Team Builder →</Link>
              </div>
              <div className="rank plain">
                {c.partners.map((p) => (
                  <Link key={p.id} href={`/champions/${p.id}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img className="icon" src={`/icons/champions/${p.id}.webp`} alt="" width={24} height={24} loading="lazy" />
                    <span className="rank-name">{p.name}</span>
                    <span className="rank-v">{pct(p.winRate)}</span>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
      {tab && <Embed src={`/embed/${tab.slug}/${tab.entry}`} title={`${c.name} builds and abilities`} hash={c.alias} />}
    </>
  );
}
