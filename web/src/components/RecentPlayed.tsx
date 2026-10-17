"use client";
/* eslint-disable @next/next/no-img-element -- small local icons */

import Link from "next/link";
import championNames from "@/data/champion-names.json";
import { usePlayed } from "@/lib/played";

const NAMES = championNames as Record<string, string>;
const ago = (at: number) => {
  const h = Math.round((Date.now() - at) / 3_600_000);
  return h < 1 ? "just now" : h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
};

// "Recently played" on Home: the visitor's own last Mayhem games, only once they have synced games.
export default function RecentPlayed() {
  const list = usePlayed();
  if (!list.length) return null;
  const wins = list.filter((g) => g.win).length;
  return (
    <section className="card span-all recent" data-accent="tier" aria-label="Recently played">
      <div className="card-head">
        <h2>
          Recently played{" "}
          <span className="card-note">
            {wins}W {list.length - wins}L
          </span>
        </h2>
        <Link href="/stats">My Stats →</Link>
      </div>
      <div className="recent-row">
        {list.map((g) => (
          <Link key={`${g.at}-${g.champion}`} href={`/champions/${g.champion}`} className="recent-item">
            <img src={`/icons/champions/${g.champion}.webp`} alt="" width={36} height={36} loading="lazy" />
            <span>
              <b>{NAMES[g.champion] ?? g.champion}</b>
              <small className={g.win ? "wr-high" : "wr-low"}>
                {g.win ? "Win" : "Loss"} · {ago(g.at)}
              </small>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
