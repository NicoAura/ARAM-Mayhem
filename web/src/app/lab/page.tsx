import type { Metadata } from "next";
import ToolPage, { toolMetadata } from "@/components/ToolPage";

// The Lab: fun tools and The Kitchen's cook builds (/lab#cook-builds).
export const metadata: Metadata = toolMetadata("/lab");

export default function Page() {
  return <ToolPage href="/lab" />;
}
