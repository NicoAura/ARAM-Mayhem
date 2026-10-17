import type { Metadata } from "next";
import { pageMeta } from "@/lib/meta";
import Embed from "@/components/Embed";
import Intro from "@/components/Intro";
import { text } from "@/lib/content";
import Pending from "@/components/Pending";
import { repoHas } from "@/lib/repo-data";

export const metadata: Metadata = pageMeta("/stats", "My Stats", "Your own ARAM Mayhem games: win rate, champions, augments and recent matches.");

export default function StatsPage() {
  return (
    <>
      <Intro eyebrow="My Stats" title={text("page./stats.title", "Your Mayhem games, in one place.")}>
        Import your games with the button below. You need to be connected to the Riot Client: open it on this computer and sign in first. Your games stay on your computer.
      </Intro>
      {repoHas("dashboard/index.html") ? (
        <Embed src="/embed/dashboard/index.html" title="Mayhem stats dashboard" minHeight={420} />
      ) : (
        <Pending pr={2}>The stats dashboard appears here once it is merged:</Pending>
      )}
    </>
  );
}
