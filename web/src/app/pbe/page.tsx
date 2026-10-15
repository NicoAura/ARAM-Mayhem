import type { Metadata } from "next";
import ComingSoon from "@/components/ComingSoon";
import PageHeader from "@/components/PageHeader";

export const metadata: Metadata = { title: "PBE · ARAM Mayhem" };

export default function PbePage() {
  return (
    <>
      <PageHeader section="pbe" eyebrow="Test server" title="PBE Changes">
        Mayhem changes currently on the test server, before they go live.
      </PageHeader>
      <ComingSoon variant="list" label="Patch changes will be listed here" />
    </>
  );
}
