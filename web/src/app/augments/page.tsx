import type { Metadata } from "next";
import Link from "next/link";
import AugmentDraft from "@/components/AugmentDraft";
import AugmentGroups from "@/components/AugmentGroups";
import SubTabs from "@/components/SubTabs";
import Intro from "@/components/Intro";
import { augmentGroups } from "@/lib/augment-groups";
import { AUGMENT_DEEPSCORE_HELP } from "@/lib/deepscore";
import { livePatch } from "@/lib/highlights";
import { pageMeta } from "@/lib/meta";

export const metadata: Metadata = pageMeta(
  "/augments",
  "ARAM Mayhem Augments by Icon & Draft Practice",
  "ARAM Mayhem augments grouped by what they do, plus augment draft practice with rerolls. The S to D augment tier list is on the Tier List.",
);

export default function AugmentsPage() {
  return (
    <>
      <Intro eyebrow={`Augments · Patch ${livePatch()}`} title="What augments do, and how to draft them.">
        Augments grouped by what they do, and draft practice with rerolls. For every augment ranked S to D, see the{" "}
        <Link className="inline-link" href="/tier-list?tab=augments">
          Tier List
        </Link>
        .
      </Intro>
      <SubTabs
        tabs={[
          {
            id: "groups",
            label: "By icon",
            content: (
              <>
                <p className="patch-note subtab-note">
                  Augments that share an icon usually share a job. Each group shows what most of its members have in common, then every member, best first.
                </p>
                <AugmentGroups groups={augmentGroups()} help={AUGMENT_DEEPSCORE_HELP} />
              </>
            ),
          },
          {
            id: "draft",
            label: "Draft practice",
            lazy: true,
            content: (
              <>
                <p className="patch-note subtab-note">
                  Four selections, three cards each, one reroll per card. After every pick you&apos;ll see how often players on your champion take it.
                </p>
                <AugmentDraft />
              </>
            ),
          },
        ]}
      />
    </>
  );
}
