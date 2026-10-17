// Simulated damage on item pages: every simulated item has a page, and every champion row links to a
// real champion.
import { describe, expect, it } from "vitest";
import championIds from "@/data/champion-ids.json";
import itemSimData from "@/data/item-sim.json";
import { itemPages } from "@/lib/item-pages";
import { itemSim } from "@/lib/item-sim";

describe("item simulated damage", () => {
  const pages = new Set(itemPages().map((i) => String(i.id)));
  const ids = Object.keys(itemSimData.items);

  it("covers most item pages", () => {
    expect(ids.length).toBeGreaterThan(50);
    for (const id of ids) expect(pages.has(id), id).toBe(true);
  });

  it("links each row to a champion page", () => {
    for (const id of ids) {
      const s = itemSim(Number(id))!;
      expect(s.champs.length).toBeGreaterThan(0);
      for (const c of s.champs) {
        expect(championIds, c.id).toHaveProperty(c.id);
        expect(c.dps).toBeGreaterThan(0);
      }
    }
  });
});
