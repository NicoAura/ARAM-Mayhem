import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { livePatch } from "@/lib/highlights";
import { itemBySlug, itemPages } from "@/lib/item-pages";
import { pageMeta } from "@/lib/meta";

// One page per item Mayhem players build (lib/item-pages.ts).

export const dynamicParams = false;
export const generateStaticParams = () => itemPages().map((i) => ({ slug: i.slug }));

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const i = itemBySlug((await params).slug);
  if (!i) return {};
  const who = i.builders.length ? ` Built most by ${i.builders.slice(0, 3).map((b) => b.name).join(", ")}.` : "";
  return pageMeta(`/items/${i.slug}`, `${i.name} in ARAM Mayhem`, `${i.name}: ${i.stats.join(", ") || "item"}${i.cost ? `, ${i.cost} gold` : ""}.${who}`);
}

export default async function ItemPage({ params }: { params: Promise<{ slug: string }> }) {
  const i = itemBySlug((await params).slug);
  if (!i) notFound();
  return (
    <>
      <section className="champ-hero aug-hero">
        <p className="eyebrow">Item · Patch {livePatch()}</p>
        <div className="aug-hero-title">
          {i.icon && (
            <span className="tilt-icon" data-tilt data-rarity="gold">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="aug-hero-icon item-hero-icon" src={i.icon} alt="" width={72} height={72} />
            </span>
          )}
          <h1>
            {i.name} <span className="champ-hero-sub">in ARAM Mayhem</span>
          </h1>
        </div>
        <div className="stat-row">
          {i.cost > 0 && (
            <div>
              <b>{i.cost.toLocaleString("en-US")}</b>
              <span>gold</span>
            </div>
          )}
          {i.stats.map((s) => {
            const [, value, label] = s.match(/^([\d.+%-]+)\s+(.+)$/) ?? [null, s, ""];
            return (
              <div key={s}>
                <b>{value}</b>
                <span>{label}</span>
              </div>
            );
          })}
        </div>
      </section>
      {i.builders.length > 0 && (
        <section className="card" data-accent="tier">
          <div className="card-head">
            <h2>Built most by</h2>
          </div>
          <div className="rank builders">
            {i.builders.map((b) => (
              <Link key={b.id} href={`/champions/${b.id}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="icon" src={`/icons/champions/${b.id}.webp`} alt="" width={24} height={24} loading="lazy" />
                <span className="rank-name">{b.name}</span>
                <span className="rank-v">{pct(b.pickRate)} build</span>
                <span className={`rank-v ${b.winRate !== null && b.winRate >= 0.52 ? "wr-good" : ""}`}>{b.winRate !== null ? `${pct(b.winRate)} win` : ""}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
      <p className="patch-note">Build rate is the share of that champion&apos;s games where they finished the item.</p>
    </>
  );
}
