"use client";
/* eslint-disable @next/next/no-img-element -- small local icons */
import Link from "next/link";
import { useNames, useT } from "./I18n";
import DeepScore from "@/components/DeepScore";
import type { AugmentGroup } from "@/lib/augment-groups";

// Augments grouped by the symbol on their icon (/tier-list?tab=groups). Each card shows what the group
// shares, its win-rate range and its average DeepScore, then every member, best first.

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const SHOWN = 12;

function Member({ a }: { a: AugmentGroup["members"][number] }) {
  const t = useT("augments");
  const name = useNames()("augments", a.id, a.name);
  return (
    <Link
      className="group-aug"
      data-rarity={a.rarity}
      href={a.href}
      title={t("{name} · {tier} tier, DeepScore {score}", {
        name,
        tier: a.tier,
        score: a.deepScore,
      })}
    >
      <img src={`/icons/augments/${a.id}.webp`} alt="" width={40} height={40} loading="lazy" />
      <span className="group-aug-name">{name}</span>
      <span className={`chip tier-${a.tier.toLowerCase()}`}>{a.tier}</span>
    </Link>
  );
}

export default function AugmentGroups({ groups, help }: { groups: AugmentGroup[]; help: string }) {
  const t = useT("augments");
  const tables = useT("tables");
  return (
    <div className="aug-groups">
      {groups.map((g) => {
        const traits = [...g.rarity, ...g.styles];
        // Hiding only one or two augments behind "Show more" saves nothing.
        const shown = g.members.length - SHOWN > 2 ? SHOWN : g.members.length;
        return (
          <section key={g.name} className="aug-group card">
            <header className="aug-group-head">
              <img className="aug-group-icon" src={`/icons/augments/${g.members[0].id}.webp`} alt="" width={48} height={48} />
              <div>
                <h3>{t(g.name)}</h3>
                <span className="card-note">{g.members.length === 1 ? t("1 augment") : t("{n} augments", { n: g.members.length })}</span>
              </div>
              <DeepScore value={g.deepScore} help={`${t("The group's average DeepScore.")} ${tables(help)}`} />
            </header>
            {(traits.length > 0 || g.words.length > 0) && (
              <p className="aug-group-traits">
                {traits.map((tr) => (
                  <span key={tr} className="aug-group-trait">
                    {t(tr)}
                  </span>
                ))}
                {g.words.map((w) => (
                  <span
                    key={w.word}
                    className="aug-group-word"
                    title={t("{pct}% of the group mention it", {
                      pct: Math.round(w.share * 100),
                    })}
                  >
                    {t(w.word)} <small>{Math.round(w.share * 100)}%</small>
                  </span>
                ))}
              </p>
            )}
            <p className="aug-group-wr">
              {t("Win rate {min} to {max}, average {avg}", {
                min: pct(g.winRate.min),
                max: pct(g.winRate.max),
                avg: pct(g.winRate.avg),
              })}
            </p>
            <div className="aug-group-members">
              {g.members.slice(0, shown).map((a) => (
                <Member key={a.id} a={a} />
              ))}
            </div>
            {g.members.length > shown && (
              <details className="aug-group-more">
                <summary>{t("Show {n} more", { n: g.members.length - shown })}</summary>
                <div className="aug-group-members">
                  {g.members.slice(shown).map((a) => (
                    <Member key={a.id} a={a} />
                  ))}
                </div>
              </details>
            )}
          </section>
        );
      })}
    </div>
  );
}
