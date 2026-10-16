import type { Metadata } from "next";
import ToolPage, { toolMetadata } from "@/components/ToolPage";
import { discoverToolTabs } from "@/lib/tabs";

// The Tools menu's embedded pages: /tools/lab, /tools/kitchen and any new site-tab.json folder.
export const dynamicParams = false;

export function generateStaticParams() {
  return discoverToolTabs()
    .filter((t) => t.href.startsWith("/tools/"))
    .map((t) => ({ slug: t.href.slice("/tools/".length) }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  return toolMetadata(`/tools/${(await params).slug}`);
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  return <ToolPage href={`/tools/${(await params).slug}`} />;
}
