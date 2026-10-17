import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { pageMeta } from "@/lib/meta";
import { recap, recapPatches, type AugRef } from "@/lib/patches";

// One recap per patch: augment changes and the champions that rose and fell most (lib/patches.ts).

export const dynamicParams = false;
export const generateStaticParams = () => recapPatches().map((patch) => ({ patch }));

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const pts = (v: number) => (Math.abs(v) * 100).toFixed(1);
const date = (d: string | null) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "");

export async function generateMetadata({ params }: { params: Promise<{ patch: string }> }): Promise<Metadata> {
  const r = recap((await params).patch);
  if (!r) return {};
  const top = r.up[0] ? ` ${r.up[0].name} rose the most.` : "";
  return pageMeta(
    `/patches/${r.patch}`,
    `ARAM Mayhem Patch ${r.patch} Recap`,
    `What changed in ARAM Mayhem on patch ${r.patch}: ${r.added.length} augments added, ${r.removed.length} removed, ${r.changed.length} changed.${top}`,
  );
}

function Aug({ a }: { a: AugRef }) {
  const body = (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="icon" src={`/icons/augments/${a.id}.webp`} alt="" width={24} height={24} loading="lazy" />
      <span className="rank-name">{a.name}</span>
      {a.tier && <span className={`chip tier-${a.tier}`}>{a.tier[0].toUpperCase() + a.tier.slice(1)}</span>}
    </>
  );
  return a.href ? (
    <Link href={a.href} data-tilt="soft" data-rarity={a.tier}>
      {body}
    </Link>
  ) : (
    <div>{body}</div>
  );
}

export default async function PatchPage({ params }: { params: Promise<{ patch: string }> }) {
  const r = recap((await params).patch);
  if (!r) notFound();
  const all = recapPatches();
  const i = all.indexOf(r.patch);
  const newer = i > 0 ? all[i - 1] : null;
  const older = all[i + 1] ?? null;
  const quiet = r.hasAugmentHistory && !r.added.length && !r.removed.length && !r.changed.length;
  return (
    <>
      <section className="champ-hero">
        <p className="eyebrow">
          <Link href="/patches">Patch Recaps</Link>
          {r.released ? ` · ${date(r.released)}` : ""}
        </p>
        <h1>
          Patch {r.patch} <span className="champ-hero-sub">ARAM Mayhem recap</span>
        </h1>
        <div className="stat-row">
          <div>
            <b>{r.added.length}</b>
            <span>augments added</span>
          </div>
          <div>
            <b>{r.removed.length}</b>
            <span>removed</span>
          </div>
          <div>
            <b>{r.changed.length}</b>
            <span>changed</span>
          </div>
          <div>
            <b>{r.days}</b>
            <span>days of games</span>
          </div>
        </div>
      </section>
      <div className="bento">
        {r.up.length > 0 && (
          <section className="card span-6" data-accent="tier">
            <div className="card-head">
              <h2>Rose the most</h2>
              <span className="card-note">win rate vs {r.prev}</span>
            </div>
            <div className="rank plain recap-movers">
              {r.up.map((c) => (
                <Link key={c.id} href={`/champions/${c.id}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className="icon" src={`/icons/champions/${c.id}.webp`} alt="" width={24} height={24} loading="lazy" />
                  <span className="rank-name">{c.name}</span>
                  <span className="rank-v">{pct(c.winRate)}</span>
                  <span className="rank-v delta-up">{pts(c.change)}</span>
                </Link>
              ))}
            </div>
          </section>
        )}
        {r.down.length > 0 && (
          <section className="card span-6" data-accent="pbe">
            <div className="card-head">
              <h2>Fell the most</h2>
              <span className="card-note">win rate vs {r.prev}</span>
            </div>
            <div className="rank plain recap-movers">
              {r.down.map((c) => (
                <Link key={c.id} href={`/champions/${c.id}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className="icon" src={`/icons/champions/${c.id}.webp`} alt="" width={24} height={24} loading="lazy" />
                  <span className="rank-name">{c.name}</span>
                  <span className="rank-v">{pct(c.winRate)}</span>
                  <span className="rank-v delta-down">{pts(c.change)}</span>
                </Link>
              ))}
            </div>
          </section>
        )}
        {r.changed.length > 0 && (
          <section className="card span-all" data-accent="sim">
            <div className="card-head">
              <h2>Augments changed</h2>
            </div>
            <ul className="recap-changes">
              {r.changed.map((a) => (
                <li key={a.id}>
                  <div className="rank plain recap-list">
                    <Aug a={a} />
                  </div>
                  <ul>
                    {a.changes.map((x) => (
                      <li key={x.name}>
                        {x.name}: <s>{x.old}</s> → <b>{x.new}</b>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </section>
        )}
        {r.added.length > 0 && (
          <section className="card span-6" data-accent="gold">
            <div className="card-head">
              <h2>Augments added</h2>
            </div>
            <div className="rank plain recap-list">
              {r.added.map((a) => (
                <Aug key={a.id} a={a} />
              ))}
            </div>
          </section>
        )}
        {r.removed.length > 0 && (
          <section className="card span-6" data-accent="lab">
            <div className="card-head">
              <h2>Augments removed</h2>
            </div>
            <div className="rank plain recap-list">
              {r.removed.map((a) => (
                <Aug key={a.id} a={a} />
              ))}
            </div>
          </section>
        )}
      </div>
      <p className="patch-note">
        {quiet
          ? "No augment changes this patch. "
          : !r.hasAugmentHistory
            ? "Augment changes aren't tracked for this patch, only win rates. "
            : ""}
        Win-rate changes compare each champion with patch {r.prev ?? "before"}.{" "}
        {older && (
          <Link className="inline-link" href={`/patches/${older}`}>
            ← Patch {older}
          </Link>
        )}
        {older && newer && " · "}
        {newer && (
          <Link className="inline-link" href={`/patches/${newer}`}>
            Patch {newer} →
          </Link>
        )}
      </p>
    </>
  );
}
