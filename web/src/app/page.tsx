import Link from "next/link";
import { text } from "@/lib/content";
import { statsDate, counts, augmentPool, kitchenBuilds, livePatch, liveTiers, topAugments, topDps } from "@/lib/highlights";
import { AugmentRoll, ChampionJump, KitchenPick, TierSnapshot } from "@/components/HomeWidgets";
import { BETA } from "@/lib/beta";
import { navPages } from "@/lib/tabs";

// eslint-disable-next-line @next/next/no-img-element
const Icon = ({ src }: { src: string }) => <img className="icon" src={src} alt="" width={24} height={24} loading="lazy" />;

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

export default function Home() {
  const tiers = liveTiers();
  const pool = augmentPool();
  const augs = topAugments();
  const patch = livePatch();
  const builds = kitchenBuilds();
  const dps = topDps();
  const n = counts();
  const date = statsDate();

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
          <section className="card span-7">
            <div className="card-head">
              <h2>Tier List{patch ? ` · Patch ${patch}` : ""}</h2>
              <Link href="/tier-list">All {n.champions} →</Link>
            </div>
            <TierSnapshot champs={tiers} />
          </section>
        )}
        {augs.length > 0 && (
          <section className="card span-5">
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
        {pool.length >= 3 && (
          <section className="card span-7">
            <div className="card-head">
              <h2>Roll an augment offer</h2>
              <Link href="/tier-list?tab=augments">All augments →</Link>
            </div>
            <AugmentRoll pool={pool} />
          </section>
        )}
        {builds.length > 0 && (
          <section className="card span-5 feature">
            <div className="card-head">
              <h2>From The Kitchen</h2>
              <Link href="/tools/kitchen">More →</Link>
            </div>
            <KitchenPick builds={builds} />
          </section>
        )}
        {dps.length > 0 && (
          <section className="card span-7">
            <div className="card-head">
              <h2>
                Simulator: top damage per second <span className="beta">Beta</span>
              </h2>
              <Link href="/tools/simulator">Open →</Link>
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
        <section className="card span-5">
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
