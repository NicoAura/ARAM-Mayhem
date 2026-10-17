import type { Metadata } from "next";
import Link from "next/link";
import AugmentDraft from "@/components/AugmentDraft";
import AugmentGroups from "@/components/AugmentGroups";
import AugmentTiers from "@/components/AugmentTiers";
import SubTabs from "@/components/SubTabs";
import Intro from "@/components/Intro";
import { augmentGroups } from "@/lib/augment-groups";
import { augmentTiers, STYLES } from "@/lib/augment-tiers";
import { AUGMENT_DEEPSCORE_HELP } from "@/lib/deepscore";
import { livePatch } from "@/lib/highlights";
import { pageMeta } from "@/lib/meta";

export const metadata: Metadata = pageMeta(
  "/augments",
  "ARAM Mayhem Augment Tier List & Draft Practice",
  "Every ARAM Mayhem augment ranked S to D for the live patch, filtered by rarity and build style, plus augment draft practice with rerolls.",
);

export default function AugmentTierPage() {
  const rows = augmentTiers();
  return (
    <>
      <Intro eyebrow={`Augments · Patch ${livePatch()}`} title="Every augment, ranked.">
        Each augment gets a DeepScore against the others of its rarity, since a selection only offers one rarity. It compares how an augment does with what its champions win anyway,
        so a strong champion&apos;s favourite has to earn its spot. Pick a style to see the augments that suit your build.
      </Intro>
      <SubTabs
        tabs={[
          {
            id: "tiers",
            label: "Tier list",
            content: (
              <>
                <AugmentTiers rows={rows} styles={STYLES} />
                <p className="patch-note">
                  Live patch games. 50 is average for the rarity; S is 70 and up, A 59, B 44, C 32 and D below. For exact numbers, see the{" "}
                  <Link className="inline-link" href="/tier-list?tab=augments">
                    augment table
                  </Link>
                  .
                </p>
              </>
            ),
          },
          {
            id: "groups",
            label: "By icon",
            lazy: true,
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
