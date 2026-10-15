import type { Metadata } from "next";
import Placeholder from "@/components/Placeholder";

export const metadata: Metadata = { title: "Simulator · ARAM Mayhem" };

export default function SimulatorPage() {
  return (
    <>
      <h1>Damage simulator</h1>
      <p className="muted">Pick a champion, items and augments to estimate damage against a target.</p>
      <Placeholder>The simulator will appear here.</Placeholder>
    </>
  );
}
