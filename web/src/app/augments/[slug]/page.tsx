import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/JsonLd";
import Link from "next/link";
import { notFound } from "next/navigation";
import { augmentBySlug, augmentPages } from "@/lib/augments";
import { livePatch } from "@/lib/highlights";
import { pageMeta } from "@/lib/meta";
import { readRepoJson } from "@/lib/repo-data";
import ShareButton from "@/components/ShareButton";
import ShareCard from "@/components/ShareCard";

// One page per augment, so each can be found in search (lib/augments.ts).

export const dynamicParams = false;
export const generateStaticParams = () => augmentPages().map((a) => ({ slug: a.slug }));

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const RARITY: Record<string, string> = { silver: "Silver", gold: "Gold", prismatic: "Prismatic" };
type Odds = Record<string, { pool: number; offer: number; withRerolls: number }>;
const odds = (tier: string) => readRepoJson<{ odds?: Odds }>("guide/augment_rules.json")?.odds?.[RARITY[tier] ?? tier];

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const a = augmentBySlug((await params).slug);
  if (!a) return {};
  const best = a.best.length ? ` Best on ${a.best.slice(0, 3).map((c) => c.name).join(", ")}.` : "";
  return pageMeta(
    `/augments/${a.slug}`,
    `${a.name} ARAM Mayhem Augment`,
    `${a.name} is a ${RARITY[a.tier] ?? a.tier} ARAM Mayhem augment with a ${pct(a.winRate)} win rate on patch ${livePatch()}.${best}`,
  );
}

export default async function AugmentPage({ params }: { params: Promise<{ slug: string }> }) {
  const a = augmentBySlug((await params).slug);
  if (!a) notFound();
  const patch = livePatch();
  const offer = odds(a.tier);
  return (
    <>
      <Breadcrumbs trail={[["Augments", "/augments"], [a.name, `/augments/${a.slug}`]]} />
      <section className="champ-hero aug-hero">
        <p className="eyebrow">
          <Link href="/tier-list?tab=augments">Augments</Link> · Patch {patch}
        </p>
        <div className="aug-hero-title">
          <span className="tilt-icon" data-tilt data-rarity={a.tier}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="aug-hero-icon" data-tier={a.tier} src={`/icons/augments/${a.id}.webp`} alt="" width={72} height={72} />
          </span>
          <h1>
            {a.name} <span className="champ-hero-sub">ARAM Mayhem augment</span>
          </h1>
        </div>
        <div className="stat-row">
          <div>
            <b>
              <span className={`chip tier-${a.tier}`}>{RARITY[a.tier] ?? a.tier}</span>
            </b>
            <span>rarity</span>
          </div>
          <div>
            <b className={a.winRate >= 0.52 ? "wr-high" : a.winRate <= 0.48 ? "wr-low" : ""}>{pct(a.winRate)}</b>
            <span>win rate{a.winRank ? `, #${a.winRank} of ${a.of}` : ""}</span>
          </div>
          <div>
            <b>{pct(a.pickRate)}</b>
            <span>pick rate{a.pickRank ? `, #${a.pickRank} of ${a.of}` : ""}</span>
          </div>
        </div>
        {offer && (
          <p className="aug-odds">
            Offered in <b>{pct(offer.offer)}</b> of {RARITY[a.tier]} selections ({pct(offer.withRerolls)} using every reroll), one of {offer.pool}{" "}
            {RARITY[a.tier]} augments.{" "}
            <Link className="inline-link" href="/info#stages">
              How augment picks work
            </Link>
          </p>
        )}
        <p className="champ-hero-links">
          <ShareButton title={a.name} />
          <ShareCard
            spec={{
              title: a.name,
              subtitle: `${RARITY[a.tier] ?? a.tier} augment · Patch ${patch ?? ""}`,
              icon: `/icons/augments/${a.id}.webp`,
              stats: [
                { label: "Win rate", value: pct(a.winRate), tone: a.winRate >= 0.52 ? "good" : a.winRate <= 0.48 ? "bad" : undefined },
                { label: "Pick rate", value: pct(a.pickRate) },
                ...(a.winRank ? [{ label: "Win rank", value: `#${a.winRank} of ${a.of}` }] : []),
              ],
              row: a.best.length ? { label: "Best on", icons: a.best.slice(0, 6).map((b) => `/icons/champions/${b.id}.webp`) } : undefined,
              url: `https://deeparam.com/augments/${a.slug}`,
            }}
          />
        </p>
      </section>
      <div className="bento">
        {a.best.length > 0 && (
          <section className="card span-6" data-accent="tier">
            <div className="card-head">
              <h2>Best champions for it</h2>
            </div>
            <div className="rank plain">
              {a.best.map((c) => (
                <Link key={c.id} href={`/champions/${c.id}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className="icon" src={`/icons/champions/${c.id}.webp`} alt="" width={24} height={24} loading="lazy" />
                  <span className="rank-name">{c.name}</span>
                </Link>
              ))}
            </div>
          </section>
        )}
        {a.pickers.length > 0 && (
          <section className="card span-6" data-accent="gold">
            <div className="card-head">
              <h2>Picked most by</h2>
            </div>
            <div className="rank plain">
              {a.pickers.map((c) => (
                <Link key={c.id} href={`/champions/${c.id}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className="icon" src={`/icons/champions/${c.id}.webp`} alt="" width={24} height={24} loading="lazy" />
                  <span className="rank-name">{c.name}</span>
                  <span className="rank-v">{pct(c.pickRate)}</span>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
      <p className="patch-note">
        &ldquo;Picked most by&rdquo; shows the share of each champion&apos;s games where they took {a.name}. See every augment on the{" "}
        <Link className="inline-link" href="/tier-list?tab=augments">
          Tier List
        </Link>
        .
      </p>
    </>
  );
}
