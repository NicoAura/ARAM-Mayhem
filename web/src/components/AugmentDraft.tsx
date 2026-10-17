"use client";
/* eslint-disable @next/next/no-img-element -- small local icons */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { DraftData } from "@/lib/draft";
import { buzz } from "@/lib/haptics";
import { getParam, setParams } from "@/lib/url-state";
import Skeleton from "@/components/Skeleton";

// Augment Draft practice (/draft?champ=Jinx): four selections of three augments, one reroll per card,
// like a real Mayhem game. After each pick it shows how often players on that champion take it,
// and which of the three cards they take most. Data: /data/draft.json.

const STAGES = [3, 7, 11, 15];
const RARITIES = ["silver", "gold", "prismatic"];
const LABEL: Record<string, string> = { silver: "Silver", gold: "Gold", prismatic: "Prismatic" };
const pct = (bp: number) => `${(bp / 100).toFixed(1)}%`;

type Pick = { id: string; offers: string[]; rarity: string };
type Card = { id: string; rerolled: boolean };

const randomOf = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)];

export default function AugmentDraft() {
  const [data, setData] = useState<DraftData | null>(null);
  const [failed, setFailed] = useState(false);
  const [champ, setChamp] = useState("");
  const [rarities, setRarities] = useState<string[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [picks, setPicks] = useState<Pick[]>([]);

  const pools = useMemo(() => {
    const out: Record<string, string[]> = { silver: [], gold: [], prismatic: [] };
    for (const [id, [, r]] of Object.entries(data?.augs ?? {})) out[r]?.push(id);
    return out;
  }, [data]);

  // Cards of a rarity that aren't already on screen or taken.
  const draw = useCallback(
    (rarity: string, exclude: Set<string>, n: number) => {
      const left = (pools[rarity] ?? []).filter((id) => !exclude.has(id));
      const out: string[] = [];
      while (out.length < n && left.length) out.push(...left.splice(Math.floor(Math.random() * left.length), 1));
      return out;
    },
    [pools],
  );

  const start = useCallback(
    (id: string) => {
      const r = STAGES.map(() => randomOf(RARITIES));
      setChamp(id);
      setRarities(r);
      setPicks([]);
      setCards(draw(r[0], new Set(), 3).map((c) => ({ id: c, rerolled: false })));
      setParams({ champ: id || null });
    },
    [draw],
  );

  useEffect(() => {
    fetch("/data/draft.json")
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: DraftData) => setData(d))
      .catch(() => setFailed(true));
  }, []);
  useEffect(() => {
    if (!data) return;
    const want = (getParam("champ") ?? "").toLowerCase();
    const known = data.champions.find((c) => c.id.toLowerCase() === want);
    start(known ? known.id : randomOf(data.champions).id);
  }, [data, start]);

  const stage = picks.length;
  const done = stage >= STAGES.length;
  const name = data?.champions.find((c) => c.id === champ)?.name ?? champ;
  const rate = (id: string) => data?.picks[champ]?.[id] ?? 0;
  // The card this champion's players take most; augments they never take rank by overall win rate.
  const best = (offers: string[]) => [...offers].sort((a, b) => rate(b) - rate(a) || (data?.augs[b]?.[2] ?? 0) - (data?.augs[a]?.[2] ?? 0))[0];
  // Where an augment ranks among this champion's picks of its rarity.
  const rankOf = (id: string) => {
    const r = data?.augs[id]?.[1];
    const mine = Object.entries(data?.picks[champ] ?? {}).filter(([a]) => data?.augs[a]?.[1] === r).sort((x, y) => y[1] - x[1]);
    const i = mine.findIndex(([a]) => a === id);
    return i < 0 ? null : { n: i + 1, of: mine.length };
  };

  const take = (id: string) => {
    if (done) return;
    const next = [...picks, { id, offers: cards.map((c) => c.id), rarity: rarities[stage] }];
    setPicks(next);
    buzz(next.length >= STAGES.length ? "done" : "tap");
    if (next.length < STAGES.length) {
      const taken = new Set(next.map((p) => p.id));
      setCards(draw(rarities[next.length], taken, 3).map((c) => ({ id: c, rerolled: false })));
    } else setCards([]);
  };
  const reroll = (i: number) => {
    const exclude = new Set([...cards.map((c) => c.id), ...picks.map((p) => p.id)]);
    const [fresh] = draw(rarities[stage], exclude, 1);
    if (!fresh) return;
    buzz();
    setCards(cards.map((c, j) => (j === i ? { id: fresh, rerolled: true } : c)));
  };

  // 1, 2 and 3 pick a card.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || /INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement)?.tagName ?? "")) return;
      const i = ["1", "2", "3"].indexOf(e.key);
      if (i >= 0 && cards[i]) take(cards[i].id);
    };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  });

  if (failed) return <p className="table-note">Couldn&apos;t load the augments. Try reloading the page.</p>;
  if (!data) return <Skeleton kind="cards" rows={3} label="Shuffling augments…" />;

  const matched = picks.filter((p) => p.id === best(p.offers)).length;
  const last = picks[picks.length - 1];

  return (
    <div className="draft">
      <div className="draft-bar">
        <label className="draft-champ builder-champ">
          {champ && <img src={`/icons/champions/${champ}.webp`} alt="" width={40} height={40} />}
          <select value={champ} aria-label="Champion" onChange={(e) => start(e.target.value)}>
            {data.champions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="btn ghost" onClick={() => start(randomOf(data.champions).id)}>
          Random champion
        </button>
        <button type="button" className="btn ghost" onClick={() => start(champ)}>
          Restart draft
        </button>
      </div>

      <ol className="draft-stages" aria-label="Selections">
        {STAGES.map((lv, i) => {
          const p = picks[i];
          return (
            <li key={lv} data-state={p ? "done" : i === stage ? "now" : undefined} data-rarity={rarities[i]}>
              <span className="draft-lv">Level {lv}</span>
              {p ? (
                <img src={`/icons/augments/${p.id}.webp`} alt={data.augs[p.id][0]} title={data.augs[p.id][0]} width={32} height={32} />
              ) : (
                <span className="draft-empty">{i === stage ? LABEL[rarities[i]] : "?"}</span>
              )}
            </li>
          );
        })}
      </ol>

      {last && (
        <p className="draft-feedback" aria-live="polite">
          {(() => {
            const r = rate(last.id);
            const rank = rankOf(last.id);
            const top = best(last.offers);
            const lead = r
              ? `${name} players take ${data.augs[last.id][0]} in ${pct(r)} of games${rank ? `, their #${rank.n} of ${rank.of} ${LABEL[last.rarity]} picks` : ""}.`
              : `${name} players rarely take ${data.augs[last.id][0]}.`;
            return top === last.id ? (
              <>
                <b className="wr-high">Top pick.</b> {lead}
              </>
            ) : (
              <>
                {lead} Their favorite of those three: <b>{data.augs[top][0]}</b>
                {rate(top) ? ` (${pct(rate(top))})` : ""}.
              </>
            );
          })()}
        </p>
      )}

      {!done ? (
        <section className="draft-pick" aria-label={`Level ${STAGES[stage]} selection`}>
          <h2>
            Level {STAGES[stage]}: choose a <span className={`chip tier-${rarities[stage]}`}>{LABEL[rarities[stage]]}</span> augment
          </h2>
          <div className="draft-cards" key={`${stage}`}>
            {cards.map((c, i) => {
              const [nm, r] = data.augs[c.id];
              return (
                <div className="draft-slot" key={`${i}-${c.id}`}>
                  <button type="button" className="draft-card" data-rarity={r} onClick={() => take(c.id)} aria-keyshortcuts={String(i + 1)}>
                    <img src={`/icons/augments/${c.id}.webp`} alt="" width={88} height={88} />
                    <span className="draft-name">{nm}</span>
                    <span className="draft-key" aria-hidden="true">
                      {i + 1}
                    </span>
                  </button>
                  <button type="button" className="btn ghost draft-reroll" disabled={c.rerolled} onClick={() => reroll(i)} aria-label={`Reroll ${nm}`}>
                    {c.rerolled ? "Rerolled" : "Reroll"}
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      ) : (
        <section className="card draft-result" data-accent="gold">
          <div className="card-head">
            <h2>
              You matched the top pick {matched} of {STAGES.length} times
            </h2>
          </div>
          <div className="draft-list">
            {picks.map((p, i) => {
              const top = best(p.offers);
              return (
                <Link key={p.id} href={data.augs[p.id][3] || `/tier-list?tab=augments&q=${encodeURIComponent(data.augs[p.id][0])}`}>
                  <span className="draft-list-lv">Lv {STAGES[i]}</span>
                  <img src={`/icons/augments/${p.id}.webp`} alt="" width={24} height={24} />
                  <span className="draft-list-name">
                    {data.augs[p.id][0]}
                    <small>{top === p.id ? "Top pick" : `Top pick was ${data.augs[top][0]}`}</small>
                  </span>
                  <span className="draft-list-v">{rate(p.id) ? pct(rate(p.id)) : "–"}</span>
                </Link>
              );
            })}
          </div>
          <p className="draft-again">
            <button type="button" className="btn" onClick={() => start(champ)}>
              Draft {name} again
            </button>
            <Link className="inline-link" href={`/champions/${champ}`}>
              {name}&apos;s best augments
            </Link>
          </p>
        </section>
      )}
      <p className="patch-note">
        Practice only: each selection&apos;s rarity is random here, and every augment of a rarity is equally likely. Percentages are how often{" "}
        {name} players take each augment on the live patch.
      </p>
    </div>
  );
}
