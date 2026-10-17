// The augment tier list (/augments): every live augment gets a tier within its rarity, and style tags
// come only from the known styles and stay specific.
import { describe, expect, it } from "vitest";
import { augmentPages } from "@/lib/augments";
import { augmentTiers, STYLES } from "@/lib/augment-tiers";

describe("augment tiers", () => {
  const rows = augmentTiers();

  it("ranks every augment page, S to D within each rarity", () => {
    expect(rows.length).toBe(augmentPages().length);
    for (const r of ["silver", "gold", "prismatic"]) {
      const tiers = rows.filter((a) => a.rarity === r).map((a) => a.tier);
      expect(tiers).toContain("S");
      expect(tiers).toContain("D");
      expect(tiers.every((t) => ["S", "A", "B", "C", "D"].includes(t))).toBe(true);
    }
  });

  it("tags styles from the known list, at most three each", () => {
    for (const a of rows) {
      expect(a.styles.length).toBeLessThanOrEqual(3);
      for (const s of a.styles) expect(Object.keys(STYLES)).toContain(s);
    }
    for (const s of Object.keys(STYLES)) expect(rows.some((a) => a.styles.includes(s as keyof typeof STYLES)), s).toBe(true);
  });
});
