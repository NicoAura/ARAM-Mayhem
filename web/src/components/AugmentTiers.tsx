"use client";
/* eslint-disable @next/next/no-img-element -- small local icons */

import Link from "next/link";
import { useEffect, useState } from "react";
import { getParam, setParams } from "@/lib/url-state";
import { EmptyState } from "@/components/EmptyState";
import DeepScore from "@/components/DeepScore";
import { AUGMENT_DEEPSCORE_HELP } from "@/lib/deepscore";

// Augment tier list (/tier-list?tab=augments&rarity=gold&style=ap): one row per tier, filtered by rarity and build style.
// Tiers and styles come from the server (lib/augment-tiers.ts).

export type TierRow = { id: number; name: string; href: string; rarity: string; tier: string; deepScore: number; winRate: number; pickRate: number; styles: string[] };

const RARITIES: [string, string][] = [
  ["", "All rarities"],
  ["prismatic", "Prismatic"],
  ["gold", "Gold"],
  ["silver", "Silver"],
];
const TIER_ORDER = ["S", "A", "B", "C", "D"];
const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

export default function AugmentTiers({ rows, styles }: { rows: TierRow[]; styles: Record<string, string> }) {
  const [rarity, setRarity] = useState("");
  const [style, setStyle] = useState("");

  useEffect(() => {
    const r = getParam("rarity") ?? "";
    const s = getParam("style") ?? "";
    if (RARITIES.some(([k]) => k === r)) setRarity(r);
    if (s in styles) setStyle(s);
  }, [styles]);

  const pick = (key: "rarity" | "style", v: string) => {
    if (key === "rarity") setRarity(v);
    else setStyle(v);
    setParams({ [key]: v || null });
  };

  const shown = rows.filter((a) => (!rarity || a.rarity === rarity) && (!style || a.styles.includes(style)));

  return (
    <div className="atiers">
      <div className="atiers-filters">
        <div className="helper-threats" role="group" aria-label="Rarity">
          {RARITIES.map(([k, l]) => (
            <button key={k || "all"} type="button" className="chip-toggle" aria-pressed={rarity === k} onClick={() => pick("rarity", k)}>
              {l}
            </button>
          ))}
        </div>
        <div className="helper-threats" role="group" aria-label="Build style">
          <button type="button" className="chip-toggle" aria-pressed={style === ""} onClick={() => pick("style", "")}>
            Any style
          </button>
          {Object.entries(styles).map(([k, l]) => (
            <button key={k} type="button" className="chip-toggle" aria-pressed={style === k} onClick={() => pick("style", k)}>
              {l}
            </button>
          ))}
        </div>
      </div>

      <p className="deepscore-legend">
        <DeepScore value={50} help={AUGMENT_DEEPSCORE_HELP} />
        <span>
          Ranked by <b>DeepScore</b>. Hover or tap the badge to see how it works.
        </span>
      </p>
      {shown.length === 0 ? (
        <EmptyState
          title="No augments match"
          action={
            <button
              type="button"
              className="btn"
              onClick={() => {
                setRarity("");
                setStyle("");
                setParams({ rarity: null, style: null });
              }}
            >
              Show every augment
            </button>
          }
        >
          Try another rarity or style.
        </EmptyState>
      ) : (
        <div className="atiers-rows">
          {TIER_ORDER.map((t) => {
            const list = shown.filter((a) => a.tier === t).sort((x, y) => y.deepScore - x.deepScore);
            if (!list.length) return null;
            return (
              <section key={t} className="atiers-row" aria-label={`Tier ${t}`}>
                <span className={`chip tier-${t.toLowerCase()} atiers-tier`}>{t}</span>
                <div className="atiers-grid">
                  {list.map((a) => (
                    <Link key={a.id} href={a.href} className="atiers-aug" data-rarity={a.rarity} title={`${a.name}: DeepScore ${a.deepScore}, ${pct(a.winRate)} win, picked in ${pct(a.pickRate)} of games`}>
                      <img src={`/icons/augments/${a.id}.webp`} alt="" width={48} height={48} loading="lazy" />
                      <span className="atiers-name">{a.name}</span>
                      <DeepScore value={a.deepScore} static />
                      <span className={`atiers-wr ${a.winRate >= 0.52 ? "wr-high" : a.winRate <= 0.48 ? "wr-low" : ""}`}>{pct(a.winRate)}</span>
                    </Link>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
