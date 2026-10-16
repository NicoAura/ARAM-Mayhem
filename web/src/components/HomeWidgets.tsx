"use client";
/* eslint-disable @next/next/no-img-element -- small local icons */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import AugmentCard from "./AugmentCard";

// The home page's interactive pieces: jump to a champion, the live tier snapshot,
// an augment offer to roll, and a Kitchen build to reroll.

type Champ = { id: string; name: string; tier: string; winRate: number; pickRate: number };
type Augment = { id: string; name: string; tier: string; winRate: number; pickRate: number };
type Build = { champion: string; title: string; augments: string[]; why: string };

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const champIcon = (id: string) => `/icons/champions/${id}.webp`;
const fold = (s: string) => s.normalize("NFD").replace(/[^a-z0-9]/gi, "").toLowerCase();

/** A search box that opens the champion's page. */
export function ChampionJump({ champs }: { champs: Champ[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const [open, setOpen] = useState(false);
  const matches = useMemo(() => {
    const f = fold(q);
    if (!f) return [];
    return champs
      .filter((c) => fold(c.name).includes(f) || fold(c.id).includes(f))
      .sort((a, b) => Number(!fold(a.name).startsWith(f)) - Number(!fold(b.name).startsWith(f)) || a.name.localeCompare(b.name))
      .slice(0, 6);
  }, [q, champs]);
  useEffect(() => setSel(0), [q]);
  const go = (c?: Champ) => c && router.push(`/champions#${c.id}`);

  return (
    <div className="jump" onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setOpen(false)}>
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input
        value={q}
        onChange={(e) => (setQ(e.target.value), setOpen(true))}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            const step = e.key === "ArrowDown" ? 1 : -1;
            setSel((s) => Math.max(0, Math.min(s + step, matches.length - 1)));
          } else if (e.key === "Enter") go(matches[sel]);
          else if (e.key === "Escape") setOpen(false);
        }}
        placeholder="Find a champion…"
        aria-label="Find a champion"
        role="combobox"
        aria-expanded={open && matches.length > 0}
        aria-controls="jump-list"
        autoComplete="off"
        spellCheck={false}
      />
      {open && matches.length > 0 && (
        <ul className="jump-list" id="jump-list" role="listbox">
          {matches.map((c, i) => (
            <li key={c.id} role="option" aria-selected={i === sel}>
              <Link href={`/champions#${c.id}`} onMouseEnter={() => setSel(i)}>
                <img src={champIcon(c.id)} alt="" width={28} height={28} />
                <span>{c.name}</span>
                <span className={`chip tier-${c.tier.toLowerCase()}`}>{c.tier}</span>
                <span className="jump-wr">{pct(c.winRate)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The live patch's S and A tier champions as icons; hover or focus one for its numbers. */
export function TierSnapshot({ champs }: { champs: Champ[] }) {
  const [tier, setTier] = useState("S");
  const [hover, setHover] = useState<Champ | null>(null);
  const list = champs.filter((c) => c.tier === tier).sort((a, b) => b.winRate - a.winRate);
  const shown = hover && hover.tier === tier ? hover : list[0];
  return (
    <div className="snap">
      <div className="seg snap-tiers" role="group" aria-label="Tier">
        {["S", "A", "B", "C", "D"].map((t) => (
          <button key={t} type="button" aria-pressed={tier === t} onClick={() => (setTier(t), setHover(null))}>
            {t}
          </button>
        ))}
      </div>
      <div className="snap-grid" onMouseLeave={() => setHover(null)}>
        {list.map((c) => (
          <Link
            key={c.id}
            href={`/champions#${c.id}`}
            className={shown?.id === c.id ? "on" : undefined}
            onMouseEnter={() => setHover(c)}
            onFocus={() => setHover(c)}
            aria-label={`${c.name}: ${pct(c.winRate)} win rate`}
          >
            <img src={champIcon(c.id)} alt="" width={40} height={40} loading="lazy" />
          </Link>
        ))}
      </div>
      {shown && (
        <div className="snap-card" aria-live="polite">
          <img src={champIcon(shown.id)} alt="" width={44} height={44} />
          <div>
            <b>{shown.name}</b>
            <span>
              {pct(shown.winRate)} win · {pct(shown.pickRate)} pick
            </span>
          </div>
          <span className={`chip tier-${shown.tier.toLowerCase()}`}>{shown.tier}</span>
        </div>
      )}
    </div>
  );
}

// Each offer is one rarity, like the game's; prismatic offers are the rarest.
const RARITY: [string, number][] = [
  ["silver", 0.4],
  ["gold", 0.4],
  ["prismatic", 0.2],
];

function rollOffer(pool: Augment[]): Augment[] {
  let r = Math.random();
  const tier = RARITY.find(([, w]) => (r -= w) < 0)?.[0] ?? "gold";
  const of = pool.filter((a) => a.tier === tier);
  const from = of.length >= 3 ? of : pool;
  const picked = new Set<number>();
  while (picked.size < Math.min(3, from.length)) picked.add(Math.floor(Math.random() * from.length));
  return [...picked].map((i) => from[i]);
}

/** Roll a three-augment offer and see which pick wins most. */
export function AugmentRoll({ pool }: { pool: Augment[] }) {
  const [offer, setOffer] = useState<Augment[]>([]);
  const [chosen, setChosen] = useState<string | null>(null);
  const [rolls, setRolls] = useState(0);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) setOffer(rollOffer(pool));
    first.current = false;
  }, [pool]);
  const best = offer.length ? offer.reduce((a, b) => (b.winRate > a.winRate ? b : a)) : null;
  const roll = () => (setOffer(rollOffer(pool)), setChosen(null), setRolls((n) => n + 1));

  return (
    <div className="roll">
      <div className="roll-cards" key={rolls}>
        {offer.map((a, i) => (
          <button
            key={a.id}
            type="button"
            className={`roll-card${chosen ? (a.id === best?.id ? " best" : a.id === chosen ? " picked" : " dim") : ""}`}
            style={{ animationDelay: `${i * 70}ms` }}
            onClick={() => setChosen(a.id)}
            disabled={Boolean(chosen)}
          >
            <AugmentCard name={a.name} tier={a.tier} icon={`/icons/augments/${a.id}.webp`} compact>
              {chosen ? `${pct(a.winRate)} win · ${pct(a.pickRate)} pick` : "Pick me"}
            </AugmentCard>
          </button>
        ))}
      </div>
      <div className="roll-foot">
        <p aria-live="polite">
          {!chosen
            ? "Pick one, then see how each does on the live patch."
            : chosen === best?.id
              ? `Good pick: ${best.name} wins most of these three.`
              : `${best?.name} wins more often (${pct(best?.winRate ?? 0)}).`}
        </p>
        <button type="button" className="btn" onClick={roll}>
          Roll again
        </button>
      </div>
    </div>
  );
}

/** One Kitchen build at a time, with a button for another. */
export function KitchenPick({ builds }: { builds: Build[] }) {
  const [i, setI] = useState(0);
  const b = builds[i];
  if (!b) return null;
  return (
    <div className="kitchen-pick" key={i}>
      <div className="kitchen-head">
        <img src={champIcon(b.champion)} alt="" width={40} height={40} />
        <div>
          <p className="eyebrow">{b.champion}</p>
          <h3>{b.title}</h3>
        </div>
      </div>
      <p className="clamp">{b.why}</p>
      <div className="chips">
        {b.augments.slice(0, 4).map((a) => (
          <span key={a} className="chip">
            {a}
          </span>
        ))}
      </div>
      {builds.length > 1 && (
        <button type="button" className="btn ghost" onClick={() => setI((n) => (n + 1) % builds.length)}>
          Another build ({i + 1}/{builds.length})
        </button>
      )}
    </div>
  );
}
