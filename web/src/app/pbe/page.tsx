import type { Metadata } from "next";
import Placeholder from "@/components/Placeholder";

export const metadata: Metadata = { title: "PBE · ARAM Mayhem" };

export default function PbePage() {
  return (
    <>
      <section className="intro">
        <p className="eyebrow">PBE</p>
        <h1>Mayhem changes currently on the test server.</h1>
      </section>
      <Placeholder>PBE changes will appear here.</Placeholder>
    </>
  );
}
