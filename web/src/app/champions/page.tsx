import HashOnly from "@/components/HashOnly";
import ToolPage, { toolMetadata } from "@/components/ToolPage";

export const metadata = toolMetadata("/champions");

// Each champion has a page at /champions#Name (from the Tier List, search and the home page);
// there's no Champions tab, so the bare address opens the Tier List.
export default function Page() {
  return (
    <HashOnly fallback="/tier-list">
      <ToolPage href="/champions" />
    </HashOnly>
  );
}
