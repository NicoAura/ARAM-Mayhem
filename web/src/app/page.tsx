import Link from "next/link";
import { chinaDate, counts, kitchenBuild, pbeSummary, toolTabs, topAugments, topChampions, topDps } from "@/lib/highlights";

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
// Win rates sit between roughly 44% and 58%, so bars use that range to show differences.
const wrWidth = (v: number) => `${Math.max(4, Math.min(100, ((v - 0.44) / 0.14) * 100))}%`;

export default function Home() {
  const champs = topChampions();
  const augs = topAugments();
  const pbe = pbeSummary();
  const build = kitchenBuild();
  const dps = topDps();
  const tools = toolTabs().filter((t) => t.slug !== "cook-builds");
  const n = counts();
  const date = chinaDate();

  return (
    <>
      <section className="hero">
        <p className="eyebrow">
          ARAM Mayhem{date ? ` · China data ${date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}` : ""}
        </p>
        <h1>Every Mayhem pick, measured.</h1>
        <p className="lede">Win rates from the Chinese servers, a fight simulator for every champion, and Season 3 changes from the test server.</p>
        <div className="stat-row">
          <div>
            <b>{n.champions}</b>
            <span>champions tracked</span>
          </div>
          <div>
            <b>{n.augments}</b>
            <span>augments rated</span>
          </div>
          {pbe && (
            <>
              <div>
                <b>+{pbe.meta.augmentCounts.added}</b>
                <span>new PBE augments</span>
              </div>
              <div>
                <b>{pbe.headliners.list.length}</b>
                <span>Headliners coming</span>
              </div>
            </>
          )}
        </div>
      </section>

      <div className="bento">
        {champs.length > 0 && (
          <section className="card span-7">
            <div className="card-head">
              <h2>Highest win rate</h2>
              <Link href="/china">All {n.champions} →</Link>
            </div>
            <div className="rank">
              {champs.map((c, i) => (
                <Link key={c.id} href={`/china?q=${encodeURIComponent(c.name)}`}>
                  <span className="rank-i">{i + 1}</span>
                  <span className="rank-name">{c.name}</span>
                  <span className="meter">
                    <i style={{ width: wrWidth(c.winRate) }} />
                  </span>
                  <span className="rank-v">{pct(c.winRate)}</span>
                </Link>
              ))}
            </div>
          </section>
        )}
        {augs.length > 0 && (
          <section className="card span-5">
            <div className="card-head">
              <h2>Best augments</h2>
              <Link href="/china?tab=augments">All →</Link>
            </div>
            <div className="rank">
              {augs.map((a, i) => (
                <Link key={a.id} href={`/china?tab=augments&q=${encodeURIComponent(a.name)}`}>
                  <span className="rank-i">{i + 1}</span>
                  <span className="rank-name">{a.name}</span>
                  <span className={`chip tier-${a.tier?.toLowerCase()}`}>{a.tier}</span>
                  <span className="rank-v">{pct(a.winRate)}</span>
                </Link>
              ))}
            </div>
          </section>
        )}
        {pbe && (
          <section className="card span-8">
            <div className="card-head">
              <h2>{pbe.meta.label} Headliners on PBE</h2>
              <Link href="/pbe">What&apos;s changing →</Link>
            </div>
            <div className="tiles">
              {pbe.headliners.list.slice(0, 6).map((h) => (
                <div key={h.name}>
                  <b>{h.name}</b>
                  <span>{h.effect}</span>
                </div>
              ))}
            </div>
          </section>
        )}
        {build && (
          <section className="card span-4 feature">
            <div className="card-head">
              <h2>From The Kitchen</h2>
              <Link href="/tools/cook-builds">More →</Link>
            </div>
            <p className="eyebrow">{build.champion}</p>
            <h3>{build.title}</h3>
            <p className="clamp">{build.why}</p>
            <div className="chips">
              {build.augments.slice(0, 4).map((a) => (
                <span key={a} className="chip">
                  {a}
                </span>
              ))}
            </div>
          </section>
        )}
        {dps.length > 0 && (
          <section className="card span-6">
            <div className="card-head">
              <h2>Simulator: top damage per second</h2>
              <Link href="/simulator">Open →</Link>
            </div>
            <div className="bars">
              {dps.map((d) => (
                <div key={d.id}>
                  <span className="rank-name">{d.name}</span>
                  <span className="bar" style={{ width: `${(d.dps / dps[0].dps) * 100}%` }} />
                  <span className="rank-v">{Math.round(d.dps).toLocaleString("en-US")}</span>
                </div>
              ))}
            </div>
          </section>
        )}
        <section className="card span-6">
          <div className="card-head">
            <h2>More to explore</h2>
          </div>
          <div className="rank links">
            {[
              { href: "/stats", label: "My Stats", body: "Your own games, synced from the League client" },
              ...tools.map((t) => ({ href: t.href, label: t.label, body: t.body })),
              { href: "/pbe", label: "PBE", body: "Every Season 3 change on the test server" },
            ].map((l) => (
              <Link key={l.href} href={l.href}>
                <span className="rank-name">{l.label}</span>
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
