/* eslint-disable @next/next/no-img-element -- small local icons */
import Link from "next/link";
import { augmentHref } from "@/lib/augments";
import { itemPages } from "@/lib/item-pages";
import { readRepoJson } from "@/lib/repo-data";
import { whatToBuildData } from "@/lib/what-to-build";
import championIds from "@/data/champion-ids.json";
import { Name, T } from "./I18n";

// The top of a champion page: what to do in game at a glance. Skill order, the build that wins most
// (with boots) and the augments to take at each rarity. Data: lib/what-to-build.ts and
// data/cn/builds/<id>.json (level-by-level skill order).

const RARITIES = [
  ["prismatic", "Prismatic"],
  ["gold", "Gold"],
  ["silver", "Silver"],
] as const;
const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const KEYS = ["Q", "W", "E", "R"];

// The most played level-by-level skill order for the most played max order.
function levelOrder(alias: string): string[] {
  const id = (championIds as Record<string, number>)[alias];
  const b = readRepoJson<{ skills?: { orders?: { order: string[] }[] }[] }>(`data/cn/builds/${id}.json`);
  return b?.skills?.[0]?.orders?.[0]?.order ?? [];
}

export default function QuickReference({ alias }: { alias: string }) {
  const data = whatToBuildData();
  const c = data.champions.find((x) => x.id === alias);
  if (!c) return null;
  const slugs = new Map(itemPages().map((i) => [i.id, i.slug]));
  const build = c.best ?? c.popular;
  const items = [...(c.boots?.items ?? []), ...(build?.items ?? [])].filter((id, i, all) => all.indexOf(id) === i && data.items[id]);
  const hasAugs = RARITIES.some(([r]) => c.augs[r]?.length);
  const levels = levelOrder(alias);
  if (!items.length && !c.skills.length && !hasAugs) return null;

  return (
    <section className="card quickref" data-accent="tier" aria-labelledby="quickref-title">
      <div className="card-head">
        <h2 id="quickref-title">
          <T ns="champion-page">Quick reference</T>
        </h2>
      </div>
      <div className="quickref-grid">
        {c.skills.length > 0 && (
          <div className="quickref-block quick-spot" id="skills">
            <h3>
              <T ns="champion-page">Skill order</T>
            </h3>
            <p className="quickref-skills">
              {c.skills.map((s, i) => (
                <span key={s}>
                  {i > 0 && <span aria-hidden="true">›</span>}
                  <b className="chip skill-key" data-key={s}>
                    {s}
                  </b>
                </span>
              ))}
            </p>
            {levels.length > 0 && (
              <div
                className="quickref-levels"
                role="table"
                aria-label="Skill to level at each champion level"
                style={{ "--n": levels.length } as React.CSSProperties}
              >
                <div role="row">
                  <span role="columnheader" aria-label="Skill" />
                  {levels.map((_, i) => (
                    <span key={i} role="columnheader">
                      {i + 1}
                    </span>
                  ))}
                </div>
                {KEYS.map((k) => (
                  <div key={k} role="row" data-key={k}>
                    <span role="rowheader">{k}</span>
                    {levels.map((l, i) => (
                      <span key={i} role="cell" data-on={l === k || undefined}>
                        {l === k ? k : ""}
                      </span>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {items.length > 0 && (
          <div className="quickref-block quickref-wide quick-spot" id="build">
            <h3>
              <T ns="champion-page">Build</T>
              {build?.winRate != null && (
                <span className="quickref-note">
                  {" · "}
                  <T ns="champion-page" v={{ pct: pct(build.winRate) }}>
                    {"{pct} win"}
                  </T>
                </span>
              )}
            </h3>
            <ol className="quickref-items">
              {items.map((id) => {
                const [name, icon] = data.items[id];
                const body = (
                  <>
                    {icon && <img src={icon} alt="" width={40} height={40} loading="lazy" />}
                    <span>
                      <Name kind="items" id={id}>
                        {name}
                      </Name>
                    </span>
                  </>
                );
                const slug = slugs.get(id);
                return <li key={id}>{slug ? <Link href={`/items/${slug}`}>{body}</Link> : body}</li>;
              })}
            </ol>
          </div>
        )}
        {hasAugs && (
          <div className="quickref-block quickref-full quick-spot" id="augments">
            <h3>
              <T ns="champion-page">Augments to take</T>
            </h3>
            <div className="quickref-augs">
              {RARITIES.map(([r, label]) =>
                c.augs[r]?.length ? (
                  <div key={r}>
                    <span className={`chip tier-${r}`}>
                      <T ns="champion-page">{label}</T>
                    </span>
                    {c.augs[r].map((a) => (
                      <Link key={a} href={augmentHref(a) ?? `/tier-list?tab=augments`} className="quickref-aug">
                        <img src={`/icons/augments/${a}.webp`} alt="" width={28} height={28} loading="lazy" />
                        <Name kind="augments" id={a}>
                          {data.augs[a]}
                        </Name>
                      </Link>
                    ))}
                  </div>
                ) : null,
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
