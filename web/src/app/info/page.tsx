import ToolPage, { toolMetadata } from "@/components/ToolPage";

export const metadata = toolMetadata("/info");

export default function Page() {
  return <ToolPage href="/info" />;
}
