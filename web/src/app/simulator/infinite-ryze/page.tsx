import FunToolPage, { funToolMetadata, type FunTool } from "@/components/FunToolPage";

const TOOL: FunTool = {
  path: "/simulator/infinite-ryze",
  folder: "ryze-calculator",
  eyebrow: "Simulator",
  title: "Infinite Ryze",
  description: "How far Ryze's AP to Mana loop goes in ARAM Mayhem with the augments and items that feed it.",
};

export const metadata = funToolMetadata(TOOL);

export default function Page() {
  return <FunToolPage tool={TOOL} />;
}
