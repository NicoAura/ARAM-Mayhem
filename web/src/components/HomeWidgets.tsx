"use client";
/* eslint-disable @next/next/no-img-element -- small local icons */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useFavorites } from "@/lib/favorites";
import FavoriteStar from "./FavoriteStar";
import { useNames, useT } from "./I18n";

// The home page's interactive pieces: jump to a champion, the live tier snapshot,
// an augment offer to roll, and a Kitchen build to reroll.

type Champ = { id: string; name: string; tier: string; winRate: number; pickRate: number; splash?: string };
type Build = { champion: string; title: string; augments: string[]; why: string };

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const champIcon = (id: string) => `/icons/champions/${id}.webp`;
const fold = (s: string) => s.normalize("NFD").replace(/[^a-z0-9]/gi, "").toLowerCase();

/** A search box that opens the champion's page. */
export function ChampionJump({ champs }: { champs: Champ[] }) {
  const router = useRouter();
  const t = useT();
  const names = useNames();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const [open, setOpen] = useState(false);
  // Champions by their name in the page's language; the English name and id still match.
  const local = useMemo(() => champs.map((c) => ({ ...c, name: names("champions", c.id, c.name), en: c.name })), [champs, names]);
  const matches = useMemo(() => {
    const f = fold(q);
    if (!f) return [];
    return local
      .filter((c) => fold(c.name).includes(f) || fold(c.en).includes(f) || fold(c.id).includes(f))
      .sort((a, b) => Number(!fold(a.name).startsWith(f)) - Number(!fold(b.name).startsWith(f)) || a.name.localeCompare(b.name))
      .slice(0, 6);
  }, [q, local]);
  useEffect(() => setSel(0), [q]);
  const go = (c?: Champ) => c && router.push(`/champions/${c.id}`);

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
        placeholder={t("Find a champion…")}
        aria-label={t("Find a champion")}
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
              <Link href={`/champions/${c.id}`} onMouseEnter={() => setSel(i)}>
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

/** Starred champions with their live numbers; hidden until a champion is starred. */
export function Favorites({ champs }: { champs: Champ[] }) {
  const ids = useFavorites();
  const t = useT();
  const names = useNames();
  const list = ids.map((id) => champs.find((c) => c.id === id)).filter((c): c is Champ => Boolean(c));
  if (!list.length) return null;
  return (
    <section className="card span-all" data-accent="gold">
      <div className="card-head">
        <h2>{t("Your favorites")}</h2>
        <Link href="/tier-list">{t("On the Tier List →")}</Link>
      </div>
      <div className="fav-grid">
        {list.map((c) => (
          <div key={c.id} className="fav-card">
            <Link href={`/champions/${c.id}`}>
              <img src={champIcon(c.id)} alt="" width={40} height={40} loading="lazy" />
              <span className="fav-name">
                <b>{names("champions", c.id, c.name)}</b>
                <span>{t("{wr} win · {pr} pick", { wr: pct(c.winRate), pr: pct(c.pickRate) })}</span>
              </span>
              <span className={`chip tier-${c.tier.toLowerCase()}`}>{c.tier}</span>
            </Link>
            <FavoriteStar id={c.id} name={c.name} />
          </div>
        ))}
      </div>
    </section>
  );
}

/** The live patch's S and A tier champions as icons; hover or focus one for its numbers. */
export function TierSnapshot({ champs }: { champs: Champ[] }) {
  const [tier, setTier] = useState("S");
  const t = useT();
  const names = useNames();
  const [hover, setHover] = useState<Champ | null>(null);
  const list = champs.filter((c) => c.tier === tier).sort((a, b) => b.winRate - a.winRate);
  const shown = hover && hover.tier === tier ? hover : list[0];
  return (
    <div className="snap">
      <div className="seg snap-tiers" role="group" aria-label={t("Tier")}>
        {["S", "A", "B", "C", "D"].map((x) => (
          <button key={x} type="button" aria-pressed={tier === x} onClick={() => (setTier(x), setHover(null))}>
            {x}
          </button>
        ))}
      </div>
      <div className="snap-grid" onMouseLeave={() => setHover(null)}>
        {list.map((c) => (
          <Link
            key={c.id}
            href={`/champions/${c.id}`}
            className={shown?.id === c.id ? "on" : undefined}
            onMouseEnter={() => setHover(c)}
            onFocus={() => setHover(c)}
            aria-label={t("{name}: {wr} win rate", { name: names("champions", c.id, c.name), wr: pct(c.winRate) })}
          >
            <img src={champIcon(c.id)} alt="" width={40} height={40} loading="lazy" />
          </Link>
        ))}
      </div>
      {shown && (
        <Link
          href={`/champions/${shown.id}`}
          className="snap-card"
          aria-live="polite"
          data-tilt="soft"
          data-parallax
          style={shown.splash ? ({ "--splash": `url("${shown.splash}")` } as React.CSSProperties) : undefined}
        >
          <img src={champIcon(shown.id)} alt="" width={44} height={44} />
          <div>
            <b>{names("champions", shown.id, shown.name)}</b>
            <span>{t("{wr} win · {pr} pick", { wr: pct(shown.winRate), pr: pct(shown.pickRate) })}</span>
          </div>
          <span className={`chip tier-${shown.tier.toLowerCase()}`}>{shown.tier}</span>
        </Link>
      )}
    </div>
  );
}

// Each offer is one rarity, like the game's; prismatic offers are the rarest.


/** One Kitchen build at a time, with a button for another. */
export function KitchenPick({ builds }: { builds: Build[] }) {
  const [i, setI] = useState(0);
  const t = useT();
  const names = useNames();
  const b = builds[i];
  if (!b) return null;
  return (
    <div className="kitchen-pick" key={i}>
      <div className="kitchen-head">
        <img src={champIcon(b.champion)} alt="" width={40} height={40} />
        <div>
          <p className="eyebrow">{names("champions", b.champion, b.champion)}</p>
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
          {t("Another build ({i}/{n})", { i: i + 1, n: builds.length })}
        </button>
      )}
    </div>
  );
}
