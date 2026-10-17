import Link from "next/link";
import { text } from "@/lib/content";
import { chefsSpecial, statsDate, counts, kitchenBuilds, livePatch, liveTiers, topAugments } from "@/lib/highlights";
import { championSplash } from "@/lib/champions";
import { ChampionJump, KitchenPick, TierSnapshot } from "@/components/HomeWidgets";
import { augmentHref } from "@/lib/augments";
import { KITCHEN } from "@/lib/tabs";
import RecentPlayed from "@/components/RecentPlayed";
import { LocalDate, ModeName, Name, T } from "@/components/I18n";

// eslint-disable-next-line @next/next/no-img-element
const Icon = ({ src }: { src: string }) => <img className="icon" src={src} alt="" width={24} height={24} loading="lazy" />;

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

export default function Home() {
  const tiers = liveTiers();
  const augs = topAugments();
  const patch = livePatch();
  const special = chefsSpecial();
  const builds = special ? [] : kitchenBuilds();
  const n = counts();
  const date = statsDate();

  return (
    <>
      <section className="hero">
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
        {special && (
          <section className="card span-all feature chef-special" data-accent="lab">
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
                <T>The Kitchen →</T>
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
          <section className="card span-all feature" data-accent="lab">
            <div className="card-head">
              <h2>
                <T>Cook builds from The Kitchen</T>
              </h2>
              <Link href={KITCHEN}>
                <T>More →</T>
              </Link>
            </div>
            <KitchenPick builds={builds} />
          </section>
        )}
      </div>
    </>
  );
}
