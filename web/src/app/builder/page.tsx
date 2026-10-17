import type { Metadata } from "next";
import BuildEditor from "@/components/BuildEditor";
import Intro from "@/components/Intro";
import { pageMeta } from "@/lib/meta";

export const metadata: Metadata = pageMeta(
  "/builder",
  "ARAM Mayhem Build Editor",
  "Drag items and augments into an ARAM Mayhem build to see its stats, gold cost and simulated damage per second.",
);

export default function BuilderPage() {
  return (
    <>
      <Intro eyebrow="Build Editor" title="Build it, then see what it does.">
        Drag items into the six slots and pick four augments. Stats, gold and simulated damage update as you go.
      </Intro>
      <BuildEditor />
    </>
  );
}
