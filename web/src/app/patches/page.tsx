import type { Metadata } from "next";
import Link from "next/link";
import Intro from "@/components/Intro";
import { pageMeta } from "@/lib/meta";
import { recap, recapPatches } from "@/lib/patches";

export const metadata: Metadata = pageMeta(
  "/patches",
  "ARAM Mayhem Patch Recaps",
  "Every ARAM Mayhem patch at a glance: augments added, removed and changed, and the champions that rose and fell most.",
);

const pts = (v: number) => `${v > 0 ? "+" : ""}${(v * 100).toFixed(1)}`;

export default function PatchesPage() {
  const recaps = recapPatches().map((p) => recap(p)!).filter(Boolean);
  return (
    <>
      <Intro eyebrow="Patch Recaps" title="What every patch changed.">
        Augment changes and the biggest champion risers and fallers, patch by patch.
      </Intro>
      <div className="recap-index">
        {recaps.map((r, i) => (
          <Link key={r.patch} className="card recap-row" href={`/patches/${r.patch}`} data-accent={i === 0 ? "tier" : undefined}>
            <b className="recap-patch">
              {r.patch}
              {i === 0 && <span className="chip">Live</span>}
            </b>
            <span className="recap-meta">
              {r.hasAugmentHistory ? `${r.added.length} added · ${r.removed.length} removed · ${r.changed.length} changed` : "Win rates only"}
            </span>
            {r.up[0] && (
              <span className="recap-top">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/icons/champions/${r.up[0].id}.webp`} alt="" width={22} height={22} loading="lazy" />
                {r.up[0].name} <span className="delta-up">{pts(r.up[0].change)}</span>
              </span>
            )}
          </Link>
        ))}
      </div>
    </>
  );
}
