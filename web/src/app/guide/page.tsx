import ToolPage, { toolMetadata } from "@/components/ToolPage";

export const metadata = toolMetadata("/guide");

export default function Page() {
  return <ToolPage href="/guide" />;
}
