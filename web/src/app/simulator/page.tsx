import type { Metadata } from "next";
import Placeholder from "@/components/Placeholder";

export const metadata: Metadata = { title: "Simulator · ARAM Mayhem" };

export default function SimulatorPage() {
  return (
    <>
      <section className="intro">
        <p className="eyebrow">Simulator</p>
        <h1>Pick a champion, items and augments to estimate damage against a target.</h1>
      </section>
      <Placeholder>The simulator will appear here.</Placeholder>
    </>
  );
}
