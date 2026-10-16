import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Embed from "@/components/Embed";
import Intro from "@/components/Intro";
import { discoverToolTabs } from "@/lib/tabs";

export const dynamicParams = false;

export function generateStaticParams() {
  return discoverToolTabs().map((t) => ({ slug: t.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const tab = discoverToolTabs().find((t) => t.slug === slug);
  return { title: tab ? `${tab.label} · DeepARAM` : "DeepARAM" };
}

export default async function ToolPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tab = discoverToolTabs().find((t) => t.slug === slug);
  if (!tab) notFound();
  return (
    <>
      <Intro eyebrow={tab.label} title={tab.body || tab.label} />
      <Embed src={`/embed/${tab.slug}/${tab.entry}`} title={tab.label} />
    </>
  );
}
