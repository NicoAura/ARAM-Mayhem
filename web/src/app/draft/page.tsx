import type { Metadata } from "next";
import AugmentDraft from "@/components/AugmentDraft";
import Intro from "@/components/Intro";
import { pageMeta } from "@/lib/meta";

export const metadata: Metadata = pageMeta(
  "/draft",
  "ARAM Mayhem Augment Draft Practice",
  "Practice ARAM Mayhem augment picks: four selections of three cards with rerolls, scored against what players on your champion take most.",
);

export default function DraftPage() {
  return (
    <>
      <Intro eyebrow="Augment Draft" title="Pick like the best players do.">
        Four selections, three cards each, one reroll per card. After every pick you&apos;ll see how often players on your champion take it.
      </Intro>
      <AugmentDraft />
    </>
  );
}
