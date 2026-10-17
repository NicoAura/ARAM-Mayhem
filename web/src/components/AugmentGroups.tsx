/* eslint-disable @next/next/no-img-element -- small local icons */
import Link from "next/link";
import DeepScore from "@/components/DeepScore";
import type { AugmentGroup } from "@/lib/augment-groups";

// Augments grouped by the symbol on their icon (/tier-list?tab=groups). Each card shows what the group
// shares, its win-rate range and its average DeepScore, then every member, best first.

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const SHOWN = 12;

function Member({ a }: { a: AugmentGroup["members"][number] }) {
  return (
    <Link className="group-aug" data-rarity={a.rarity} href={a.href} title={`${a.name} · ${a.tier} tier, DeepScore ${a.deepScore}`}>
      <img src={`/icons/augments/${a.id}.webp`} alt="" width={40} height={40} loading="lazy" />
      <span className="group-aug-name">{a.name}</span>
      <span className={`chip tier-${a.tier.toLowerCase()}`}>{a.tier}</span>
    </Link>
  );
}

export default function AugmentGroups({ groups, help }: { groups: AugmentGroup[]; help: string }) {
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
                <h3>{g.name}</h3>
                <span className="card-note">
                  {g.members.length} augment{g.members.length === 1 ? "" : "s"}
                </span>
              </div>
              <DeepScore value={g.deepScore} help={`The group's average DeepScore. ${help}`} />
            </header>
            {(traits.length > 0 || g.words.length > 0) && (
              <p className="aug-group-traits">
                {traits.map((t) => (
                  <span key={t} className="aug-group-trait">
                    {t}
                  </span>
                ))}
                {g.words.map((w) => (
                  <span key={w.word} className="aug-group-word" title={`${Math.round(w.share * 100)}% of the group mention it`}>
                    {w.word} <small>{Math.round(w.share * 100)}%</small>
                  </span>
                ))}
              </p>
            )}
            <p className="aug-group-wr">
              Win rate {pct(g.winRate.min)} to {pct(g.winRate.max)}, average <b>{pct(g.winRate.avg)}</b>
            </p>
            <div className="aug-group-members">
              {g.members.slice(0, shown).map((a) => (
                <Member key={a.id} a={a} />
              ))}
            </div>
            {g.members.length > shown && (
              <details className="aug-group-more">
                <summary>Show {g.members.length - shown} more</summary>
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
