import type { Metadata } from "next";
import BuildEditor from "@/components/BuildEditor";
import Intro from "@/components/Intro";
import SubTabs from "@/components/SubTabs";
import TeamBuilder from "@/components/TeamBuilder";
import { pageMeta } from "@/lib/meta";
import NeedsScript from "@/components/NeedsScript";
import { T } from "@/components/I18n";

// Build tools (/builds?tab=…, under More): the Build Editor (default) and the Team Builder.
// What to build for a champion is on its page; /builds?champ=… and the old What to build address
// redirect there (next.config.ts). /builder and /synergy redirect here, keeping their query; /compare and ?tab=compare go to the Tier List.

export const metadata: Metadata = pageMeta(
  "/builds",
  "ARAM Mayhem Build Editor & Team Builder",
  "Try ARAM Mayhem builds with simulated damage and check how your team fits together.",
);

const Note = ({ children }: { children: React.ReactNode }) => <p className="patch-note subtab-note">{children}</p>;

export default function BuildsPage() {
  return (
    <>
      <Intro eyebrow={<T ns="builds">Build tools</T>} title={<T ns="builds">Try builds and plan a team.</T>}>
        <T ns="builds">
          Try your own build with simulated damage, or check how your team fits together. The build that wins most for each champion is on its page.
        </T>
      </Intro>
      <NeedsScript />
      <SubTabs
        ns="builds"
        tabs={[
          {
            id: "editor",
            label: "Build Editor",
            content: (
              <>
                <Note>
                  <T ns="builds">Drag items into the six slots and pick four augments. Stats, gold and simulated damage update as you go.</T>
                </Note>
                <BuildEditor />
              </>
            ),
          },
          {
            id: "team",
            label: "Team",
            lazy: true,
            content: (
              <>
                <Note>
                  <T ns="builds">{"Add your team, or just your own champion, to see each pair's win rate and the best champions to add."}</T>
                </Note>
                <TeamBuilder />
              </>
            ),
          },
        ]}
      />
    </>
  );
}
