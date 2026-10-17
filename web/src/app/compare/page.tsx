import type { Metadata } from "next";
import ChampionCompare from "@/components/ChampionCompare";
import Intro from "@/components/Intro";
import { pageMeta } from "@/lib/meta";

export const metadata: Metadata = pageMeta(
  "/compare",
  "Compare ARAM Mayhem Champions",
  "Put two ARAM Mayhem champions side by side: win rate, tier, augments, core items, skill order and simulated damage.",
);

export default function ComparePage() {
  return (
    <>
      <Intro eyebrow="Compare" title="Two champions, side by side.">
        Pick any two champions to line up their live-patch stats, builds and simulated damage.
      </Intro>
      <ChampionCompare />
    </>
  );
}
