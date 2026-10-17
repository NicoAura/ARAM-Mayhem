import Link from "next/link";
import { text } from "@/lib/content";
import { chefsSpecial, statsDate, counts, kitchenBuilds, livePatch, liveTiers, topAugments } from "@/lib/highlights";
import { whatToBuildData } from "@/lib/what-to-build";
import { championSplash } from "@/lib/champions";
import { ChampionJump, Favorites, KitchenPick, TierSnapshot } from "@/components/HomeWidgets";
import { BETA } from "@/lib/beta";
import HeroParticles from "@/components/HeroParticles";
import { augmentHref } from "@/lib/augments";
import { movers } from "@/lib/champions";
import { KITCHEN, navPages } from "@/lib/tabs";
import RecentPlayed from "@/components/RecentPlayed";
import { LocalDate, ModeName, Name, T } from "@/components/I18n";

// eslint-disable-next-line @next/next/no-img-element
const Icon = ({ src }: { src: string }) => <img className="icon" src={src} alt="" width={24} height={24} loading="lazy" />;

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const pts = (v: number) => `${v > 0 ? "+" : ""}${(v * 100).toFixed(1)}`;

// The full builds with the best win rate among builds players commonly use (at least 3% of a
// champion's games), one per champion.
function winningBuilds(n = 6) {
  const d = whatToBuildData();
  return d.champions
    .filter((c) => c.best && c.best.winRate !== null && c.best.pickRate >= 0.03)
    .sort((a, b) => (b.best!.winRate ?? 0) - (a.best!.winRate ?? 0))
    .slice(0, n)
    .map((c) => ({
      id: c.id,
      name: c.name,
      winRate: c.best!.winRate ?? 0,
      items: c.best!.items.filter((i) => d.items[i]?.[1]).map((i) => ({ id: i, name: d.items[i][0], icon: d.items[i][1] })),
    }));
}

export default function Home() {
  const tiers = liveTiers();
  const augs = topAugments();
  const patch = livePatch();
  const special = chefsSpecial();
  const builds = special ? [] : kitchenBuilds();
  const wins = winningBuilds();
  const n = counts();
  const date = statsDate();
  const moved = movers();

  return (
    <>
      <section className="hero has-particles">
        <HeroParticles />
        <p className="eyebrow">
          <ModeName />
          {patch && (
            <>
              {" · "}
              <T v={{ patch }}>{"Patch {patch}"}</T>
            </>
          )}
          {date && (
            <>
              {" · "}
              <T>Last updated</T> <LocalDate iso={date.toISOString()} />
            </>
          )}
        </p>
        <h1>
          <T>{text("home.title", "Every Mayhem pick, measured.")}</T>
        </h1>
        <p className="lede">
          <T>{text("home.lede")}</T>
        </p>
        {tiers.length > 0 && <ChampionJump champs={tiers} />}
      </section>

      <div className="bento">
        <RecentPlayed />
        <Favorites champs={tiers} />
        {tiers.length > 0 && (
          <section className="card span-7" data-accent="tier">
            <div className="card-head">
              <h2>
                <T>Tier List</T>
                {patch && (
                  <>
                    {" · "}
                    <T v={{ patch }}>{"Patch {patch}"}</T>
                  </>
                )}
              </h2>
              <Link href="/tier-list">
                <T v={{ n: n.champions }}>{"All {n} →"}</T>
              </Link>
            </div>
            <TierSnapshot champs={tiers.map((c) => ({ ...c, splash: championSplash(c.id) }))} />
          </section>
        )}
        {augs.length > 0 && (
          <section className="card span-5" data-accent="gold">
            <div className="card-head">
              <h2>
                <T>Best augments</T>
              </h2>
              <Link href="/tier-list?tab=augments">
                <T>All →</T>
              </Link>
            </div>
            <div className="rank">
              {augs.map((a, i) => (
                <Link key={a.id} href={augmentHref(a.id) ?? `/tier-list?tab=augments&q=${encodeURIComponent(a.name)}`} data-tilt="soft" data-rarity={a.tier?.toLowerCase()}>
                  <span className="rank-i">{i + 1}</span>
                  <Icon src={`/icons/augments/${a.id}.webp`} />
                  <span className="rank-name">
                    <Name kind="augments" id={a.id}>
                      {a.name}
                    </Name>
                  </span>
                  <span className={`chip tier-${a.tier?.toLowerCase()}`}>{a.tier && <T>{a.tier}</T>}</span>
                  <span className="rank-v">{pct(a.winRate)}</span>
                </Link>
              ))}
            </div>
          </section>
        )}
        {moved.prev && moved.up.length > 0 && (
          <section className="card span-all" data-accent="tier">
            <div className="card-head">
              <h2>
                <T v={{ patch: moved.prev }}>{"Biggest movers since {patch}"}</T>
              </h2>
              <Link href="/tier-list?sort=change.desc">
                <T>All changes →</T>
              </Link>
            </div>
            <div className="movers">
              {[
                ["Rising", moved.up],
                ["Falling", moved.down],
              ].map(([label, list]) => (
                <div key={label as string} className="rank">
                  <p className="movers-label">
                    <T>{label as string}</T>
                  </p>
                  {(list as typeof moved.up).map((m) => (
                    <Link key={m.id} href={`/champions/${m.id}`}>
                      <Icon src={`/icons/champions/${m.id}.webp`} />
                      <span className="rank-name">
                        <Name kind="champions" id={m.id}>
                          {m.name}
                        </Name>
                      </span>
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
        {special && (
          <section className="card span-5 feature chef-special" data-accent="lab">
            <div className="card-head">
              <h2>
                <T>Today&apos;s Chef Special</T>
                {special.date && (
                  <span className="card-note">
                    {" "}
                    · <LocalDate iso={`${special.date}T12:00:00Z`} />
                  </span>
                )}
              </h2>
              <Link href={special.href}>
                <T>The Lab →</T>
              </Link>
            </div>
            <div className="kitchen-head">
              <Icon src={`/icons/champions/${special.champion}.webp`} />
              <div>
                <p className="eyebrow">
                  <Name kind="champions" id={special.champion}>
                    {special.name}
                  </Name>
                  {special.tier && ` · ${special.tier}`}
                </p>
                <h3>{special.title}</h3>
              </div>
            </div>
            <p className="clamp">{special.why}</p>
            {special.items.length > 0 && (
              <div className="chef-items">
                {special.items.map((i) =>
                  i.href ? (
                    <Link key={i.name} href={i.href} title={i.name}>
                      {i.icon ? <Icon src={i.icon} /> : i.name}
                    </Link>
                  ) : (
                    <span key={i.name} className="chip">
                      {i.name}
                    </span>
                  ),
                )}
              </div>
            )}
            <div className="chips">
              {special.augments.map((a) => (
                <span key={a.name} className={`chip ${a.core ? `tier-${a.rarity}` : ""}`}>
                  {a.name}
                </span>
              ))}
            </div>
            {special.winRate !== null && (
              <p className="table-note">
                {special.champWinRate !== null ? (
                  <T v={{ wr: pct(special.winRate), all: pct(special.champWinRate), name: special.name }}>
                    {"Won {wr} of games with this core, against {all} for {name} overall."}
                  </T>
                ) : (
                  <T v={{ wr: pct(special.winRate) }}>{"Won {wr} of games with this core."}</T>
                )}
                {special.play && ` ${special.play}`}
              </p>
            )}
          </section>
        )}
        {builds.length > 0 && (
          <section className="card span-5 feature" data-accent="lab">
            <div className="card-head">
              <h2>
                <T>Cook builds from The Lab</T>
              </h2>
              <Link href={KITCHEN}>
                <T>More →</T>
              </Link>
            </div>
            <KitchenPick builds={builds} />
          </section>
        )}
        {wins.length > 0 && (
          <section className="card span-7" data-accent="gold">
            <div className="card-head">
              <h2>
                <T>Winning builds this patch</T>
              </h2>
            </div>
            <div className="rank home-builds">
              {wins.map((c) => (
                <Link key={c.id} href={`/champions/${c.id}`}>
                  <Icon src={`/icons/champions/${c.id}.webp`} />
                  <span className="rank-name">
                    <Name kind="champions" id={c.id}>
                      {c.name}
                    </Name>
                  </span>
                  <span className="home-build-items" aria-label={c.items.map((i) => i.name).join(", ")}>
                    {c.items.map((i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={i.id} src={i.icon} alt="" title={i.name} width={24} height={24} loading="lazy" />
                    ))}
                  </span>
                  <span className="rank-v wr-good">{pct(c.winRate)}</span>
                </Link>
              ))}
            </div>
          </section>
        )}
        <section className="card span-5" data-accent="info">
          <div className="card-head">
            <h2>
              <T>More to explore</T>
            </h2>
          </div>
          <div className="rank links">
            {[...navPages().filter((t) => t.href !== "/tier-list"), { href: "/stats", label: "My Stats", body: "Your own Mayhem games" }].map((l) => (
              <Link key={l.href} href={l.href}>
                <span className="rank-name">
                  <T>{l.label}</T>
                  {BETA.has(l.href) && (
                    <span className="beta">
                      <T>Beta</T>
                    </span>
                  )}
                </span>
                <span className="rank-body">{l.body && <T>{l.body}</T>}</span>
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
