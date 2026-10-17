import type { Metadata } from "next";
import BuildEditor from "@/components/BuildEditor";
import ChampionCompare from "@/components/ChampionCompare";
import Intro from "@/components/Intro";
import SubTabs from "@/components/SubTabs";
import TeamBuilder from "@/components/TeamBuilder";
import { pageMeta } from "@/lib/meta";
import NeedsScript from "@/components/NeedsScript";

// Build tools (/builds?tab=…, under More): the Build Editor (default), Compare and the Team Builder.
// What to build for a champion is on its page; /builds?champ=… and the old What to build address
// redirect there (next.config.ts). /builder, /compare and /synergy redirect here, keeping their query.

export const metadata: Metadata = pageMeta(
  "/builds",
  "ARAM Mayhem Build Editor, Compare & Team Builder",
  "Try ARAM Mayhem builds with simulated damage, line two champions up, and check how your team fits together.",
);

const Note = ({ children }: { children: React.ReactNode }) => <p className="patch-note subtab-note">{children}</p>;

export default function BuildsPage() {
  return (
    <>
      <Intro eyebrow="Build tools" title="Try builds, compare champions, plan a team.">
        Try your own build with simulated damage, line two champions up, or check how your team fits together. The build that wins most for each champion is on its page.
      </Intro>
      <NeedsScript />
      <SubTabs
        tabs={[
          {
            id: "editor",
            label: "Build Editor",
            content: (
              <>
                <Note>Drag items into the six slots and pick four augments. Stats, gold and simulated damage update as you go.</Note>
                <BuildEditor />
              </>
            ),
          },
          {
            id: "compare",
            label: "Compare",
            lazy: true,
            content: (
              <>
                <Note>Pick any two champions to line up their live-patch stats, builds and simulated damage.</Note>
                <ChampionCompare />
              </>
            ),
          },
          {
            id: "team",
            label: "Team",
            lazy: true,
            content: (
              <>
                <Note>Add your team, or just your own champion, to see each pair&apos;s win rate and the best champions to add.</Note>
                <TeamBuilder />
              </>
            ),
          },
        ]}
      />
    </>
  );
}
