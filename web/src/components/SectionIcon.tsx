import type { SectionKey } from "@/lib/sections";
import { PbeIcon, SimulatorIcon, StatsIcon } from "./icons";

const icons = { stats: StatsIcon, simulator: SimulatorIcon, pbe: PbeIcon };

export default function SectionIcon({ section, className }: { section: SectionKey; className?: string }) {
  const Icon = icons[section];
  return <Icon className={className} />;
}
