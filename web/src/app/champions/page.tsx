import type { Metadata } from "next";
import ChampionRedirect from "@/components/ChampionRedirect";
import { championAliases } from "@/lib/champions";

export const metadata: Metadata = { title: "Champions · DeepARAM", robots: { index: false, follow: true } };

// Each champion has its own page at /champions/<Alias>; this address only forwards old #links there.
export default function Page() {
  return <ChampionRedirect aliases={championAliases()} />;
}
