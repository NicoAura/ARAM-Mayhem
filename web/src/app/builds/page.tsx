import type { Metadata } from "next";
import BuildEditor from "@/components/BuildEditor";
import BuildHelper from "@/components/BuildHelper";
import ChampionCompare from "@/components/ChampionCompare";
import Intro from "@/components/Intro";
import SubTabs from "@/components/SubTabs";
import TeamBuilder from "@/components/TeamBuilder";
import { pageMeta } from "@/lib/meta";

// Builds (/builds?tab=…): the build tools on one page. What to build (default), the Build Editor,
// Compare and the Team Builder. Their old addresses (/what-to-build, /builder, /compare, /synergy)
// redirect here (next.config.ts), keeping their query.

export const metadata: Metadata = pageMeta(
  "/builds",
  "ARAM Mayhem Builds: Build Helper, Build Editor & Compare",
  "What to build in ARAM Mayhem against the enemy team, a build editor with simulated damage, champion comparisons and team synergy.",
);

const Note = ({ children }: { children: React.ReactNode }) => <p className="patch-note subtab-note">{children}</p>;

export default function BuildsPage() {
  return (
    <>
      <Intro eyebrow="Builds" title="What to build, and why.">
        Get the build that wins most for your champion, try your own, line two champions up, or check how your team fits together.
      </Intro>
      <SubTabs
        tabs={[
          {
            id: "helper",
            label: "What to build",
            content: (
              <>
                <Note>Pick your champion, then what the enemy team has: the build that wins most, swaps for this game and the augments to grab.</Note>
                <BuildHelper />
              </>
            ),
          },
          {
            id: "editor",
            label: "Build Editor",
            lazy: true,
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
