import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/JsonLd";
import Link from "next/link";
import ShareButton from "@/components/ShareButton";
import ChampionRadar from "@/components/ChampionRadar";
import SplashAccent from "@/components/SplashAccent";
import WinRateChart from "@/components/WinRateChart";
import ChampionShowcase from "@/components/ChampionShowcase";
import QuickBar from "@/components/QuickBar";
import QuickReference from "@/components/QuickReference";
import { notFound } from "next/navigation";
import Embed from "@/components/Embed";
import { championAliases, championSummary, champList } from "@/lib/champions";
import ArchetypeTags from "@/components/ArchetypeTags";
import { Name, T } from "@/components/I18n";
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
  // Neighbours by name, for the arrows (and the [ and ] keys, lib/subtab-nav.ts).
  const all = champList();
  const at = all.findIndex((x) => x.id === c.alias);
  const prev = all[(at - 1 + all.length) % all.length];
  const next = all[(at + 1) % all.length];
  return (
    <>
      <Breadcrumbs
        trail={[
          ["Champions", "/champions"],
          [c.name, `/champions/${c.alias}`],
        ]}
      />
      <SplashAccent src={c.splash} />
      <section className="champ-hero" data-parallax style={c.splash ? ({ "--splash": `url("${c.splash}")` } as React.CSSProperties) : undefined}>
        <ChampionShowcase alias={c.alias} name={c.name} />
        <p className="eyebrow">
          <Link href="/tier-list">
            <T ns="champion-page">Tier List</T>
          </Link>{" "}
          ·{" "}
          <T ns="champion-page" v={{ patch: c.patch ?? "" }}>
            {"Patch {patch}"}
          </T>
        </p>
        <nav className="champ-steps" aria-label="Other champions">
          <Link href={`/champions/${prev.id}`} data-swipe="prev" rel="prev">
            ‹{" "}
            <Name kind="champions" id={prev.id}>
              {prev.name}
            </Name>
          </Link>
          <Link href={`/champions/${next.id}`} data-swipe="next" rel="next">
            <Name kind="champions" id={next.id}>
              {next.name}
            </Name>{" "}
            ›
          </Link>
        </nav>
        <div className="champ-hero-title">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="champ-hero-icon" src={`/icons/champions/${c.alias}.webp`} alt="" width={72} height={72} />
          <h1>
            <Name kind="champions" id={c.alias}>
              {c.name}
            </Name>{" "}
            <span className="champ-hero-sub">
              <T ns="champion-page">ARAM Mayhem build</T>
            </span>
          </h1>
        </div>
        {c.title && <p className="lede">{c.title.charAt(0).toUpperCase() + c.title.slice(1)}</p>}
        <ArchetypeTags names={championTags(c.alias)} info={championTagData().info} link />
        <p className="champ-hero-links">
          <ShareButton title={c.name} />
        </p>
        {c.winRate !== undefined && (
          <div className="stat-row">
            <div>
              <b className="has-chip">
                <span className={`chip tier-${c.tier?.toLowerCase()}`}>{c.tier}</span>
              </b>
              <span>
                <T ns="champion-page" v={{ rank: c.rank ?? "", of: c.of ?? "" }}>
                  {"tier, #{rank} of {of}"}
                </T>
              </span>
            </div>
            <div>
              <b className={c.winRate >= 0.52 ? "wr-high" : c.winRate <= 0.48 ? "wr-low" : ""}>{pct(c.winRate)}</b>
              <span>
                <T ns="champion-page">win rate</T>
              </span>
            </div>
            <div>
              <b>{pct(c.pickRate ?? 0)}</b>
              <span>
                <T ns="champion-page">pick rate</T>
              </span>
            </div>
            {c.change !== null && (
              <div>
                <b className={c.change > 0 ? "delta-up" : c.change < 0 ? "delta-down" : ""}>{pts(c.change)}</b>
                <span>
                  <T ns="champion-page" v={{ patch: c.prev ?? "" }}>
                    {"since {patch}"}
                  </T>
                </span>
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
                <h2>
                  <T ns="champion-page">Best teammates</T>
                </h2>
              </div>
              <div className="rank plain">
                {c.partners.map((p) => (
                  <Link key={p.id} href={`/champions/${p.id}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img className="icon" src={`/icons/champions/${p.id}.webp`} alt="" width={24} height={24} loading="lazy" />
                    <span className="rank-name">
                      <Name kind="champions" id={p.id}>
                        {p.name}
                      </Name>
                    </span>
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
          <ChampionRadar id={c.alias} name={c.name} axes={c.radar} />
        </div>
      )}
      <div className="bento quick-spot" id="history">
        <WinRateChart id={c.alias} name={c.name} history={c.history} patches={c.patches} champions={champList()} />
      </div>
      {tab && (
        <div className="quick-spot" id="details">
          <Embed src={`/embed/${tab.slug}/${tab.entry}`} title={`${c.name} builds and abilities`} hash={c.alias} />
        </div>
      )}
    </>
  );
}
