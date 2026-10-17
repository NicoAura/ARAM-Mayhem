import type { Metadata } from "next";
import BuildHelper from "@/components/BuildHelper";
import Intro from "@/components/Intro";
import { pageMeta } from "@/lib/meta";

export const metadata: Metadata = pageMeta(
  "/what-to-build",
  "What Should I Build? ARAM Mayhem Build Helper",
  "Pick your ARAM Mayhem champion and what the enemy team has to get the build that wins most, item swaps, skill order and augments to look for.",
);

export default function WhatToBuildPage() {
  return (
    <>
      <Intro eyebrow="Build Helper" title="What should I build?">
        Pick your champion, then tell us what the enemy team has. You&apos;ll get the build that wins most, swaps for this game, and the augments to grab.
      </Intro>
      <BuildHelper />
    </>
  );
}
