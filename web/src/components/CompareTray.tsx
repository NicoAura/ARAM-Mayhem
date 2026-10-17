"use client";
/* eslint-disable @next/next/no-img-element -- small local icons */

import Link from "next/link";
import { usePathname } from "next/navigation";
import championNames from "@/data/champion-names.json";
import { clearCompare, toggleCompare, useCompare } from "@/lib/compare-tray";

// A tray pinned to the bottom of the screen while champions are picked for comparing (CompareToggle).
// With two picked it links straight to /compare with both; hidden on the Compare page itself.

const NAMES = championNames as Record<string, string>;
const nameOf = (id: string) => NAMES[id] ?? id.replace(/([a-z])([A-Z])/g, "$1 $2");

export default function CompareTray() {
  const picked = useCompare();
  const pathname = usePathname();
  if (!picked.length || pathname === "/compare") return null;
  const [a, b] = picked;
  return (
    <aside className="cmp-tray" aria-label="Compare tray">
      <ul>
        {[0, 1].map((i) => {
          const id = picked[i];
          return id ? (
            <li key={id}>
              <img src={`/icons/champions/${id}.webp`} alt="" width={32} height={32} />
              <span>{nameOf(id)}</span>
              <button type="button" aria-label={`Remove ${nameOf(id)}`} onClick={() => toggleCompare(id)}>
                ×
              </button>
            </li>
          ) : (
            <li key="empty">
              <span className="cmp-empty">Pick one more</span>
            </li>
          );
        })}
      </ul>
      <div className="cmp-actions">
        <button type="button" className="cmp-clear" onClick={clearCompare}>
          Clear
        </button>
        <Link className="btn cmp-go" href={`/compare?a=${a}${b ? `&b=${b}` : ""}`} aria-disabled={!b || undefined}>
          Compare
        </Link>
      </div>
    </aside>
  );
}
