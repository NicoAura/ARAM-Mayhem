"use client";
/* eslint-disable @next/next/no-img-element -- small local icons */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DraftData } from "@/lib/draft";
import { buzz } from "@/lib/haptics";
import { getParam, setParams } from "@/lib/url-state";
import Skeleton from "@/components/Skeleton";
import { LoadError } from "@/components/EmptyState";
import { useNames, useT } from "./I18n";

// Augment Draft practice (/tier-list?tab=draft&champ=Jinx): four selections of three augments, one reroll per card,
// like a real Mayhem game. After each pick it shows how often players on that champion take it,
// and which of the three cards they take most. Data: /data/draft.json.

const STAGES = [3, 7, 11, 15];
const RARITIES = ["silver", "gold", "prismatic"];
const LABEL: Record<string, string> = {
  silver: "Silver",
  gold: "Gold",
  prismatic: "Prismatic",
};
const pct = (bp: number) => `${(bp / 100).toFixed(1)}%`;

type Pick = { id: string; offers: string[]; rarity: string };
type Card = { id: string; rerolled: boolean };

const randomOf = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)];

export default function AugmentDraft() {
  const t = useT("augments");
  const names = useNames();
  const [data, setData] = useState<DraftData | null>(null);
  const [failed, setFailed] = useState(false);
  const [champ, setChamp] = useState("");
  const [rarities, setRarities] = useState<string[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [picks, setPicks] = useState<Pick[]>([]);
  const root = useRef<HTMLDivElement>(null);

  const pools = useMemo(() => {
    const out: Record<string, string[]> = {
      silver: [],
      gold: [],
      prismatic: [],
    };
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
  const name = names("champions", champ, data?.champions.find((c) => c.id === champ)?.name ?? champ);
  // An augment's name in the page's language.
  const aug = (id: string) => names("augments", id, data?.augs[id]?.[0] ?? id);
  const rarityName = (r: string) => t(LABEL[r]);
  const rate = (id: string) => data?.picks[champ]?.[id] ?? 0;
  // The card this champion's players take most; augments they never take rank by overall win rate.
  const best = (offers: string[]) => [...offers].sort((a, b) => rate(b) - rate(a) || (data?.augs[b]?.[2] ?? 0) - (data?.augs[a]?.[2] ?? 0))[0];
  // Where an augment ranks among this champion's picks of its rarity.
  const rankOf = (id: string) => {
    const r = data?.augs[id]?.[1];
    const mine = Object.entries(data?.picks[champ] ?? {})
      .filter(([a]) => data?.augs[a]?.[1] === r)
      .sort((x, y) => y[1] - x[1]);
    const i = mine.findIndex(([a]) => a === id);
    return i < 0 ? null : { n: i + 1, of: mine.length };
  };

  const take = (id: string) => {
    if (done) return;
    const next = [...picks, { id, offers: cards.map((c) => c.id), rarity: rarities[stage] }];
    setPicks(next);
    // Taking a Prismatic lands heavier.
    buzz(next.length >= STAGES.length ? "done" : rarities[stage] === "prismatic" ? "thud" : "tap");
    if (next.length < STAGES.length) {
      const taken = new Set(next.map((p) => p.id));
      setCards(
        draw(rarities[next.length], taken, 3).map((c) => ({
          id: c,
          rerolled: false,
        })),
      );
    } else setCards([]);
  };
  const reroll = (i: number) => {
    const exclude = new Set([...cards.map((c) => c.id), ...picks.map((p) => p.id)]);
    const [fresh] = draw(rarities[stage], exclude, 1);
    if (!fresh) return;
    buzz();
    setCards(cards.map((c, j) => (j === i ? { id: fresh, rerolled: true } : c)));
  };

  // Each new set of cards flips over (globals.css); feel it as they turn, heavier for Prismatic.
  const shownCards = cards.map((c) => c.id).join();
  useEffect(() => {
    if (!shownCards || !root.current?.offsetParent) return;
    const t = setTimeout(() => buzz(rarities[stage] === "prismatic" ? "thud" : "tick"), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per new set of cards
  }, [shownCards]);

  // 1, 2 and 3 pick a card, while the draft is on screen (it shares /augments with the tier list).
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (!root.current?.offsetParent) return;
      if (e.metaKey || e.ctrlKey || e.altKey || /INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement)?.tagName ?? "")) return;
      const i = ["1", "2", "3"].indexOf(e.key);
      if (i >= 0 && cards[i]) take(cards[i].id);
    };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  });

  if (failed) return <LoadError what={t("The augments")} />;
  if (!data) return <Skeleton kind="cards" rows={3} label={t("Shuffling augments…")} />;

  const matched = picks.filter((p) => p.id === best(p.offers)).length;
  const last = picks[picks.length - 1];

  return (
    <div className="draft" ref={root}>
      <div className="draft-bar">
        <label className="draft-champ builder-champ">
          {champ && <img src={`/icons/champions/${champ}.webp`} alt="" width={40} height={40} />}
          <select value={champ} aria-label={t("Champion")} onChange={(e) => start(e.target.value)}>
            {data.champions.map((c) => (
              <option key={c.id} value={c.id}>
                {names("champions", c.id, c.name)}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="btn ghost" onClick={() => start(randomOf(data.champions).id)}>
          {t("Random champion")}
        </button>
        <button type="button" className="btn ghost" onClick={() => start(champ)}>
          {t("Restart draft")}
        </button>
      </div>

      <ol className="draft-stages" aria-label={t("Selections")}>
        {STAGES.map((lv, i) => {
          const p = picks[i];
          return (
            <li key={lv} data-state={p ? "done" : i === stage ? "now" : undefined} data-rarity={rarities[i]}>
              <span className="draft-lv">{t("Level {lv}", { lv })}</span>
              {p ? (
                <img src={`/icons/augments/${p.id}.webp`} alt={aug(p.id)} title={aug(p.id)} width={32} height={32} />
              ) : (
                <span className="draft-empty">{i === stage ? rarityName(rarities[i]) : "?"}</span>
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
              ? rank
                ? t("{champ} players take {aug} in {pct} of games, their #{n} of {of} {rarity} picks.", {
                    champ: name,
                    aug: aug(last.id),
                    pct: pct(r),
                    n: rank.n,
                    of: rank.of,
                    rarity: rarityName(last.rarity),
                  })
                : t("{champ} players take {aug} in {pct} of games.", {
                    champ: name,
                    aug: aug(last.id),
                    pct: pct(r),
                  })
              : t("{champ} players rarely take {aug}.", {
                  champ: name,
                  aug: aug(last.id),
                });
            return top === last.id ? (
              <>
                <b className="wr-high">{t("Top pick.")}</b> {lead}
              </>
            ) : (
              <>
                {lead}{" "}
                {rate(top)
                  ? t("Their favorite of those three: {aug} ({pct}).", {
                      aug: aug(top),
                      pct: pct(rate(top)),
                    })
                  : t("Their favorite of those three: {aug}.", {
                      aug: aug(top),
                    })}
              </>
            );
          })()}
        </p>
      )}

      {!done ? (
        <section className="draft-pick" aria-label={t("Level {lv} selection", { lv: STAGES[stage] })}>
          <h2>
            {t("Level {lv}: choose an augment", { lv: STAGES[stage] })} <span className={`chip tier-${rarities[stage]}`}>{rarityName(rarities[stage])}</span>
          </h2>
          <div className="draft-cards" key={`${stage}`}>
            {cards.map((c, i) => {
              const [, r] = data.augs[c.id];
              const nm = aug(c.id);
              return (
                <div className="draft-slot" key={`${i}-${c.id}`}>
                  <button type="button" className="draft-card" data-rarity={r} onClick={() => take(c.id)} aria-keyshortcuts={String(i + 1)}>
                    <img src={`/icons/augments/${c.id}.webp`} alt="" width={88} height={88} />
                    <span className="draft-name">{nm}</span>
                    <span className="draft-key" aria-hidden="true">
                      {i + 1}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="btn ghost draft-reroll"
                    disabled={c.rerolled}
                    onClick={() => reroll(i)}
                    aria-label={t("Reroll {aug}", { aug: nm })}
                  >
                    {c.rerolled ? t("Rerolled") : t("Reroll")}
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
              {t("You matched the top pick {n} of {of} times", {
                n: matched,
                of: STAGES.length,
              })}
            </h2>
          </div>
          <div className="draft-list">
            {picks.map((p, i) => {
              const top = best(p.offers);
              return (
                <Link key={p.id} href={data.augs[p.id][3] || `/tier-list?tab=augments&q=${encodeURIComponent(data.augs[p.id][0])}`}>
                  <span className="draft-list-lv">{t("Lv {lv}", { lv: STAGES[i] })}</span>
                  <img src={`/icons/augments/${p.id}.webp`} alt="" width={24} height={24} />
                  <span className="draft-list-name">
                    {aug(p.id)}
                    <small>{top === p.id ? t("Top pick") : t("Top pick was {aug}", { aug: aug(top) })}</small>
                  </span>
                  <span className="draft-list-v">{rate(p.id) ? pct(rate(p.id)) : "–"}</span>
                </Link>
              );
            })}
          </div>
          <p className="draft-again">
            <button type="button" className="btn" onClick={() => start(champ)}>
              {t("Draft {champ} again", { champ: name })}
            </button>
            <Link className="inline-link" href={`/champions/${champ}`}>
              {t("{champ}'s best augments", { champ: name })}
            </Link>
          </p>
        </section>
      )}
      <p className="patch-note">
        {t(
          "Practice only: each selection's rarity is random here, and every augment of a rarity is equally likely. Percentages are how often {champ} players take each augment on the live patch.",
          { champ: name },
        )}
      </p>
    </div>
  );
}
