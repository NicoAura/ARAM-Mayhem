import Link from "next/link";
import { text } from "@/lib/content";
import { statsDate, counts, augmentPool, kitchenBuilds, livePatch, liveTiers, topAugments, topDps } from "@/lib/highlights";
import { AugmentRoll, ChampionJump, KitchenPick, TierSnapshot } from "@/components/HomeWidgets";
import { BETA } from "@/lib/beta";
import { movers } from "@/lib/champions";
import { KITCHEN, navPages } from "@/lib/tabs";

// eslint-disable-next-line @next/next/no-img-element
const Icon = ({ src }: { src: string }) => <img className="icon" src={src} alt="" width={24} height={24} loading="lazy" />;

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const pts = (v: number) => `${v > 0 ? "+" : ""}${(v * 100).toFixed(1)}`;

export default function Home() {
  const tiers = liveTiers();
  const pool = augmentPool();
  const augs = topAugments();
  const patch = livePatch();
  const builds = kitchenBuilds();
  const dps = topDps();
  const n = counts();
  const date = statsDate();
  const moved = movers();

  return (
    <>
      <section className="hero">
        <p className="eyebrow">
          ARAM Mayhem{patch ? ` · Patch ${patch}` : ""}{date ? ` · Stats from ${date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}` : ""}
        </p>
        <h1>{text("home.title", "Every Mayhem pick, measured.")}</h1>
        <p className="lede">{text("home.lede")}</p>
        {tiers.length > 0 && <ChampionJump champs={tiers} />}
        <div className="stat-row">
          <div>
            <b>{n.champions}</b>
            <span>champions tracked</span>
          </div>
          <div>
            <b>{n.augments}</b>
            <span>augments rated</span>
          </div>
        </div>
      </section>

      <div className="bento">
        {tiers.length > 0 && (
          <section className="card span-7" data-accent="tier">
            <div className="card-head">
              <h2>Tier List{patch ? ` · Patch ${patch}` : ""}</h2>
              <Link href="/tier-list">All {n.champions} →</Link>
            </div>
            <TierSnapshot champs={tiers} />
          </section>
        )}
        {augs.length > 0 && (
          <section className="card span-5" data-accent="gold">
            <div className="card-head">
              <h2>Best augments</h2>
              <Link href="/tier-list?tab=augments">All →</Link>
            </div>
            <div className="rank">
              {augs.map((a, i) => (
                <Link key={a.id} href={`/tier-list?tab=augments&q=${encodeURIComponent(a.name)}`}>
                  <span className="rank-i">{i + 1}</span>
                  <Icon src={`/icons/augments/${a.id}.webp`} />
                  <span className="rank-name">{a.name}</span>
                  <span className={`chip tier-${a.tier?.toLowerCase()}`}>{a.tier}</span>
                  <span className="rank-v">{pct(a.winRate)}</span>
                </Link>
              ))}
            </div>
          </section>
        )}
        {moved.prev && moved.up.length > 0 && (
          <section className="card span-all" data-accent="tier">
            <div className="card-head">
              <h2>Biggest movers since {moved.prev}</h2>
              <Link href="/tier-list?sort=change.desc">All changes →</Link>
            </div>
            <div className="movers">
              {[
                ["Rising", moved.up],
                ["Falling", moved.down],
              ].map(([label, list]) => (
                <div key={label as string} className="rank">
                  <p className="movers-label">{label as string}</p>
                  {(list as typeof moved.up).map((m) => (
                    <Link key={m.id} href={`/champions/${m.id}`}>
                      <Icon src={`/icons/champions/${m.id}.webp`} />
                      <span className="rank-name">{m.name}</span>
                      <span className={`chip tier-${m.tier.toLowerCase()}`}>{m.tier}</span>
                      <span className="rank-v">{pct(m.winRate)}</span>
                      <span className={`rank-v ${m.change > 0 ? "delta-up" : "delta-down"}`}>{pts(m.change)}</span>
                    </Link>
                  ))}
                </div>
              ))}
            </div>
          </section>
        )}
        {pool.length >= 3 && (
          <section className="card span-7" data-accent="gold">
            <div className="card-head">
              <h2>Roll an augment offer</h2>
              <Link href="/tier-list?tab=augments">All augments →</Link>
            </div>
            <AugmentRoll pool={pool} />
          </section>
        )}
        {builds.length > 0 && (
          <section className="card span-5 feature" data-accent="lab">
            <div className="card-head">
              <h2>Cook builds from The Lab</h2>
              <Link href={KITCHEN}>More →</Link>
            </div>
            <KitchenPick builds={builds} />
          </section>
        )}
        {dps.length > 0 && (
          <section className="card span-7" data-accent="sim">
            <div className="card-head">
              <h2>
                Simulator: top damage per second <span className="beta">Beta</span>
              </h2>
              <Link href="/simulator">Open →</Link>
            </div>
            <div className="bars">
              {dps.map((d) => (
                <div key={d.id}>
                  <span className="rank-name">
                    <Icon src={`/icons/champions/${d.id}.webp`} />
                    {d.name}
                  </span>
                  <span className="bar" style={{ width: `${(d.dps / dps[0].dps) * 100}%` }} />
                  <span className="rank-v">{Math.round(d.dps).toLocaleString("en-US")}</span>
                </div>
              ))}
            </div>
          </section>
        )}
        <section className="card span-5" data-accent="info">
          <div className="card-head">
            <h2>More to explore</h2>
          </div>
          <div className="rank links">
            {[...navPages().filter((t) => t.href !== "/tier-list"), { href: "/stats", label: "My Stats", body: "Your own Mayhem games" }].map((l) => (
              <Link key={l.href} href={l.href}>
                <span className="rank-name">
                  {l.label}
                  {BETA.has(l.href) && <span className="beta">Beta</span>}
                </span>
                <span className="rank-body">{l.body}</span>
                <span className="rank-arrow" aria-hidden="true">
                  →
                </span>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
