import type { Metadata } from "next";
import Placeholder from "@/components/Placeholder";

export const metadata: Metadata = { title: "Stats · ARAM Mayhem" };

export default function StatsPage() {
  return (
    <>
      <section className="intro">
        <p className="eyebrow">Stats</p>
        <h1>Win rates, augments and builds from ARAM Mayhem matches.</h1>
      </section>
      <Placeholder>Stats tables will appear here once the match data is connected.</Placeholder>
    </>
  );
}
