import type { Metadata } from "next";
import Link from "next/link";
import championNames from "@/data/champion-names.json";
import Intro from "@/components/Intro";
import OpenLink from "@/components/OpenLink";

// A shared build's link (/share/builds?champ=Jinx&items=…&augs=…&tab=editor), made by the Share button on
// the Builds page. Link previews get the champion's splash and name; a visitor goes straight on to the
// build on /builds with the same query.

const NAMES = championNames as Record<string, string>;
type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

async function target(searchParams: Props["searchParams"]) {
  const q = await searchParams;
  const champ = Object.keys(NAMES).find((k) => k.toLowerCase() === one(q.champ).toLowerCase()) ?? "";
  const keep = new URLSearchParams();
  for (const k of ["tab", "champ", "vs", "items", "augs"]) if (one(q[k])) keep.set(k, k === "champ" ? champ : one(q[k]));
  if (!["helper", "editor", ""].includes(keep.get("tab") ?? "")) keep.delete("tab");
  return { champ, name: NAMES[champ], href: `/builds${keep.size ? `?${keep}` : ""}`, items: one(q.items).split(",").filter(Boolean).length };
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { champ, name, href, items } = await target(searchParams);
  const title = name ? `${name} build for ARAM Mayhem · DeepARAM` : "An ARAM Mayhem build · DeepARAM";
  const description = name
    ? `${items ? `${items} items` : "The build that wins most"} for ${name} in ARAM Mayhem, with augments and simulated damage.`
    : "What to build in ARAM Mayhem, with augments and simulated damage.";
  const image = champ ? { url: `/assets/dd/img/champion/splash/${champ}_0.jpg`, width: 1215, height: 717, alt: name } : { url: "/og.png", width: 1200, height: 630, alt: "DeepARAM" };
  return {
    title,
    description,
    robots: { index: false },
    alternates: { canonical: href },
    openGraph: { type: "website", siteName: "DeepARAM", title, description, images: [image] },
    twitter: { card: "summary_large_image", title, description, images: [image.url] },
  };
}

export default async function ShareBuildPage({ searchParams }: Props) {
  const { name, href } = await target(searchParams);
  return (
    <Intro eyebrow="Builds" title={name ? `${name} build` : "Shared build"}>
      <OpenLink href={href} />
      <Link className="inline-link" href={href}>
        Open the build →
      </Link>
    </Intro>
  );
}
