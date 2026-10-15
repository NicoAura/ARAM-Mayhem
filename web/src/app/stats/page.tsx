import type { Metadata } from "next";
import Placeholder from "@/components/Placeholder";

export const metadata: Metadata = { title: "Stats · ARAM Mayhem" };

export default function StatsPage() {
  return (
    <>
      <h1>Stats</h1>
      <p className="muted">Win rates, augments and builds from ARAM Mayhem matches.</p>
      <Placeholder>Stats tables will appear here once the match data is connected.</Placeholder>
    </>
  );
}
