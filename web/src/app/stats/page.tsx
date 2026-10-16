import type { Metadata } from "next";
import Embed from "@/components/Embed";
import Intro from "@/components/Intro";
import { text } from "@/lib/content";
import Pending from "@/components/Pending";
import RiotIdSignIn from "@/components/RiotIdSignIn";
import { repoHas } from "@/lib/repo-data";

export const metadata: Metadata = { title: "My Stats · DeepARAM" };

export default function StatsPage() {
  return (
    <>
      <Intro eyebrow="My Stats" title={text("page./stats.title", "Your Mayhem games, in one place.")}>
        Load your match archive (mayhem-backup.json) below. The file is read in your browser and never uploaded.
      </Intro>
      <RiotIdSignIn />
      {repoHas("dashboard/index.html") ? (
        <Embed src="/embed/dashboard/index.html" title="Mayhem stats dashboard" minHeight={420} />
      ) : (
        <Pending pr={2}>The stats dashboard appears here once it is merged:</Pending>
      )}
    </>
  );
}
