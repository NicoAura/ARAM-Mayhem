import type { Metadata } from "next";
import Link from "next/link";
import AugmentTiers from "@/components/AugmentTiers";
import Intro from "@/components/Intro";
import { augmentTiers, STYLES } from "@/lib/augment-tiers";
import { livePatch } from "@/lib/highlights";
import { pageMeta } from "@/lib/meta";

export const metadata: Metadata = pageMeta(
  "/augments",
  "ARAM Mayhem Augment Tier List",
  "Every ARAM Mayhem augment ranked S to D for the live patch, filtered by rarity and by build style: crit, on-hit, AP, lethality, AD, tank and enchanter.",
);

export default function AugmentTierPage() {
  const rows = augmentTiers();
  return (
    <>
      <Intro eyebrow={`Augment Tier List · Patch ${livePatch()}`} title="Every augment, ranked.">
        Each augment is ranked against the others of its rarity, since a selection only offers one rarity. Rarely picked augments need a bigger edge to rank high. Pick a style to see the
        augments that suit your build.
      </Intro>
      <AugmentTiers rows={rows} styles={STYLES} />
      <p className="patch-note">
        Live patch games. S is the top 8% of each rarity, then A 20%, B 32%, C 25% and D 15%. For exact numbers, see the{" "}
        <Link className="inline-link" href="/tier-list?tab=augments">
          augment table
        </Link>
        .
      </p>
    </>
  );
}
