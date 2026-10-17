"use client";

import { useEffect, useState } from "react";

// "3 hours ago" with a coloured dot (fresh within a day and a half, ageing within a week, stale after),
// worked out in the visitor's browser so a cached page still tells the truth.
const ago = (ms: number) => {
  const m = Math.round(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"} ago`;
  const h = Math.round(m / 60);
  if (h < 36) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
};

export default function Freshness({ at }: { at: string | null }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);
  if (!at) return <span className="fresh" data-state="unknown">Not known yet</span>;
  const when = new Date(at);
  const age = now === null ? null : now - when.getTime();
  const state = age === null ? "unknown" : age < 36 * 3600e3 ? "fresh" : age < 7 * 86400e3 ? "ageing" : "stale";
  return (
    <span className="fresh" data-state={state}>
      <time dateTime={when.toISOString()} title={when.toLocaleString()}>
        {age === null ? when.toISOString().slice(0, 10) : ago(age)}
      </time>
    </span>
  );
}
