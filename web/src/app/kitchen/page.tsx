import type { Metadata } from "next";
import ToolPage, { toolMetadata } from "@/components/ToolPage";

// The Kitchen: the daily Chef Special and its archive (/kitchen#chefs-special-YYYY-MM-DD). Formerly The Lab
// at /lab, which redirects here.
export const metadata: Metadata = toolMetadata("/kitchen");

export default function Page() {
  return <ToolPage href="/kitchen" />;
}
