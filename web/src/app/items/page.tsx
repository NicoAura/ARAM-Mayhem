import type { Metadata } from "next";
import Intro from "@/components/Intro";
import ItemIndex from "@/components/ItemIndex";
import { livePatch } from "@/lib/highlights";
import { itemPages } from "@/lib/item-pages";
import { pageMeta } from "@/lib/meta";

export const metadata: Metadata = pageMeta("/items", "ARAM Mayhem Items", "Every item ARAM Mayhem players build, tagged by what it gives: attack, magic, defense and utility, with filters.");

export default function ItemsPage() {
  const list = itemPages().map(({ id, slug, name, icon, cost, tags, popularity }) => ({ id, slug, name, icon, cost, tags, popularity }));
  return (
    <>
      <Intro eyebrow={`Items · Patch ${livePatch()}`} title="Every item, by what it gives.">
        Pick tags to narrow the list: every tag you pick has to match. Open an item for its stats, who builds it and how much damage it adds in the Simulator.
      </Intro>
      <ItemIndex items={list} />
    </>
  );
}
