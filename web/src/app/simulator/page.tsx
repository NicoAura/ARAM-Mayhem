import type { Metadata } from "next";
import ComingSoon from "@/components/ComingSoon";
import PageHeader from "@/components/PageHeader";

export const metadata: Metadata = { title: "Simulator · ARAM Mayhem" };

export default function SimulatorPage() {
  return (
    <>
      <PageHeader section="simulator" eyebrow="Theorycraft" title="Damage Simulator">
        Pick a champion, items and augments to estimate damage against a target.
      </PageHeader>
      <ComingSoon variant="form" label="The simulator is being built" />
    </>
  );
}
