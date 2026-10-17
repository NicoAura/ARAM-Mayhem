import type { Metadata } from "next";
import Link from "next/link";
import FavoriteStar from "@/components/FavoriteStar";
import CompareToggle from "@/components/CompareToggle";
import ShareButton from "@/components/ShareButton";
import ShareCard from "@/components/ShareCard";
import ChampionRadar from "@/components/ChampionRadar";
import SplashAccent from "@/components/SplashAccent";
import { TIER_COLORS } from "@/lib/share-card";
import WinRateChart from "@/components/WinRateChart";
import ChampionShowcase from "@/components/ChampionShowcase";
import QuickBar from "@/components/QuickBar";
import QuickReference from "@/components/QuickReference";
import { notFound } from "next/navigation";
import Embed from "@/components/Embed";
import { championAliases, championSummary, champList } from "@/lib/champions";
import ArchetypeTags from "@/components/ArchetypeTags";
import { championTagData, championTags } from "@/lib/champion-tags";
import { pageMeta } from "@/lib/meta";
import { discoverToolTabs } from "@/lib/tabs";

// One page per champion, so each can be found in search: a server-rendered summary of the live
// patch (tier, rates, change), a quick in-game reference (skill order, build, augments), then
// partners, charts and the full champion page from champions/.

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

// The sticky jump bar's stops, in page order.
const SPOTS = [
  { id: "skills", label: "Skills" },
  { id: "build", label: "Build" },
  { id: "augments", label: "Augments" },
  { id: "teammates", label: "Teammates" },
  { id: "playstyle", label: "Playstyle" },
  { id: "history", label: "History" },
  { id: "details", label: "Abilities" },
];

export default async function ChampionPage({ params }: { params: Promise<{ alias: string }> }) {
  const c = championSummary((await params).alias);
  const tab = discoverToolTabs().find((t) => t.href === "/champions");
  if (!c) notFound();
  // Neighbours by name, for the arrows (and phone swipes, lib/subtab-nav.ts).
  const all = champList();
  const at = all.findIndex((x) => x.id === c.alias);
  const prev = all[(at - 1 + all.length) % all.length];
  const next = all[(at + 1) % all.length];
  return (
    <>
      <SplashAccent src={c.splash} />
      <section className="champ-hero" data-parallax style={c.splash ? ({ "--splash": `url("${c.splash}")` } as React.CSSProperties) : undefined}>
        <ChampionShowcase alias={c.alias} name={c.name} />
        <p className="eyebrow">
          <Link href="/tier-list">Tier List</Link> · Patch {c.patch}
        </p>
        <nav className="champ-steps" aria-label="Other champions">
          <Link href={`/champions/${prev.id}`} data-swipe="prev" rel="prev">
            ‹ {prev.name}
          </Link>
          <Link href={`/champions/${next.id}`} data-swipe="next" rel="next">
            {next.name} ›
          </Link>
        </nav>
        <div className="champ-hero-title">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="champ-hero-icon" src={`/icons/champions/${c.alias}.webp`} alt="" width={72} height={72} />
          <h1>
            {c.name} <span className="champ-hero-sub">ARAM Mayhem build</span>
          </h1>
        </div>
        {c.title && <p className="lede">{c.title.charAt(0).toUpperCase() + c.title.slice(1)}</p>}
        <ArchetypeTags names={championTags(c.alias)} info={championTagData().info} link />
        <p className="champ-hero-links">
          <FavoriteStar id={c.alias} name={c.name} label />
          <CompareToggle id={c.alias} name={c.name} label />
          <Link className="inline-link" href={`/builds?tab=compare&a=${c.alias}`}>
            Compare with another champion
          </Link>
          <Link className="inline-link" href={`/builds?champ=${c.alias}`}>
            What should I build?
          </Link>
          <Link className="inline-link" href={`/builds?tab=editor&champ=${c.alias}`}>
            Try a build
          </Link>
          <ShareButton title={c.name} />
          {c.winRate !== undefined && (
            <ShareCard
              spec={{
                title: c.name,
                subtitle: `Patch ${c.patch ?? ""} · #${c.rank} of ${c.of}`,
                art: c.splash,
                icon: `/icons/champions/${c.alias}.webp`,
                badge: c.tier && TIER_COLORS[c.tier] ? { text: c.tier, ...TIER_COLORS[c.tier] } : undefined,
                stats: [
                  { label: "Win rate", value: pct(c.winRate), tone: c.winRate >= 0.52 ? "good" : c.winRate <= 0.48 ? "bad" : undefined },
                  { label: "Pick rate", value: pct(c.pickRate ?? 0) },
                  ...(c.change !== null ? [{ label: `Since ${c.prev}`, value: pts(c.change), tone: c.change > 0 ? ("good" as const) : c.change < 0 ? ("bad" as const) : undefined }] : []),
                ],
                row: c.augments.length ? { label: "Most picked augments", icons: c.augments.slice(0, 6).map((a) => `/icons/augments/${a.id}.webp`) } : undefined,
                url: `https://deeparam.com/champions/${c.alias}`,
              }}
            />
          )}
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
      <QuickBar spots={SPOTS} />
      <QuickReference alias={c.alias} />
      {c.partners.length > 0 && (
        <div className="bento quick-spot" id="teammates">
          {c.partners.length > 0 && (
            <section className="card span-all" data-accent="tier">
              <div className="card-head">
                <h2>Best teammates</h2>
                <Link href={`/builds?tab=team&team=${c.alias}`}>Team Builder →</Link>
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
      {c.radar.length >= 3 && (
        <div className="bento quick-spot" id="playstyle">
          <ChampionRadar name={c.name} axes={c.radar} />
        </div>
      )}
      <div className="bento quick-spot" id="history">
        <WinRateChart name={c.name} history={c.history} patches={c.patches} champions={champList()} />
      </div>
      {tab && (
        <div className="quick-spot" id="details">
          <Embed src={`/embed/${tab.slug}/${tab.entry}`} title={`${c.name} builds and abilities`} hash={c.alias} />
        </div>
      )}
    </>
  );
}
