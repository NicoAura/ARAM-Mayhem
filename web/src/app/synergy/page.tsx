import type { Metadata } from "next";
import Intro from "@/components/Intro";
import TeamBuilder from "@/components/TeamBuilder";
import { pageMeta } from "@/lib/meta";

export const metadata: Metadata = pageMeta(
  "/synergy",
  "ARAM Mayhem Team Builder & Duo Synergy",
  "Pick your ARAM Mayhem team to see each pair's win rate together and which champions fit it best.",
);

export default function SynergyPage() {
  return (
    <>
      <Intro eyebrow="Team Builder" title="Who plays best together.">
        Add your team, or just your own champion, to see each pair&apos;s win rate and the best champions to add.
      </Intro>
      <TeamBuilder />
    </>
  );
}
