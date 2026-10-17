import Link from "next/link";
import type { TagInfo } from "@/lib/tag-info";

// A champion's archetype tags as colour-coded chips: Riot's class (filled), subclass (outlined) and
// playstyle (dot). Hovering or focusing one shows what it means; with `link`, each opens the tier list
// filtered to that tag.

export default function ArchetypeTags({ names, info, link, compact }: { names: string[]; info: TagInfo; link?: boolean; compact?: boolean }) {
  const shown = names.filter((n) => info[n]);
  if (!shown.length) return null;
  return (
    <span className={compact ? "arch-tags compact" : "arch-tags"}>
      {shown.map((n) => {
        const t = info[n];
        const props = {
          className: "arch-tag",
          "data-kind": t.kind,
          "data-tip": t.meaning,
          "aria-label": `${n}: ${t.meaning}`,
          style: { "--tag": t.color } as React.CSSProperties,
        };
        return link ? (
          <Link key={n} href={`/tier-list?tag=${encodeURIComponent(n)}`} {...props}>
            {n}
          </Link>
        ) : (
          <span key={n} tabIndex={0} {...props}>
            {n}
          </span>
        );
      })}
    </span>
  );
}
