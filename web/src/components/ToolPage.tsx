import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Embed from "@/components/Embed";
import Intro from "@/components/Intro";
import { pageMeta } from "@/lib/meta";
import { discoverToolTabs } from "@/lib/tabs";

// A tab whose page is another folder's static site (a site-tab.json folder), found by its URL.

export const toolMetadata = (href: string): Metadata => {
  const tab = discoverToolTabs().find((t) => t.href === href);
  return tab ? pageMeta(href, tab.label, tab.body || `${tab.label} for ARAM Mayhem.`) : { title: "DeepARAM" };
};

export default function ToolPage({ href }: { href: string }) {
  const tab = discoverToolTabs().find((t) => t.href === href);
  if (!tab) notFound();
  return (
    <>
      <Intro eyebrow={tab.label} title={tab.body || tab.label} />
      <Embed src={`/embed/${tab.slug}/${tab.entry}`} title={tab.label} />
    </>
  );
}
