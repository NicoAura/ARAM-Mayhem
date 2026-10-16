import ToolPage, { toolMetadata } from "@/components/ToolPage";

export const metadata = toolMetadata("/champions");

export default function Page() {
  return <ToolPage href="/champions" />;
}
