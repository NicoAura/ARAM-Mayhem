"use client";
/* eslint-disable @next/next/no-img-element -- small local icons */

import Link from "next/link";
import { clearRecent, useRecent } from "@/lib/recent";

const KIND: Record<string, string> = { champions: "Champion", augments: "Augment", items: "Item", patches: "Patch" };

// "Recently viewed" on Home: the last pages opened on this device, as a scrolling row.
export default function RecentStrip() {
  const list = useRecent();
  if (!list.length) return null;
  return (
    <section className="card span-all recent" data-accent="tier" aria-label="Recently viewed">
      <div className="card-head">
        <h2>Recently viewed</h2>
        <button type="button" className="team-clear" onClick={clearRecent}>
          Clear
        </button>
      </div>
      <div className="recent-row">
        {list.map((r) => (
          <Link key={r.href} href={r.href} className="recent-item">
            {r.icon ? <img src={r.icon} alt="" width={36} height={36} loading="lazy" /> : <span className="recent-dot" aria-hidden="true">{r.title.slice(0, 1)}</span>}
            <span>
              <b>{r.title}</b>
              <small>{KIND[r.kind] ?? ""}</small>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
