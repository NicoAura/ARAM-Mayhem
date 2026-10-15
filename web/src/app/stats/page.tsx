import type { Metadata } from "next";
import ComingSoon from "@/components/ComingSoon";
import PageHeader from "@/components/PageHeader";

export const metadata: Metadata = { title: "Stats · ARAM Mayhem" };

export default function StatsPage() {
  return (
    <>
      <PageHeader section="stats" eyebrow="Match data" title="Mayhem Stats">
        Win rates, augments and builds from ARAM Mayhem matches.
      </PageHeader>
      <ComingSoon variant="table" label="Champion tables arrive once the match data is connected" />
    </>
  );
}
