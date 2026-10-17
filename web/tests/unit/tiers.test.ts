import { describe, expect, it } from "vitest";
import { champStats, TIERS, type PatchRow } from "@/lib/tiers";

const row = (name: string, win_rate: number, pick_rate: number, patch = "16.20", days = 14): PatchRow => ({
  patch, days, name, win_rate, pick_rate, damage: null, tank: null, kp: null, dead: null, augs: "",
});

describe("champStats", () => {
  it("returns nothing for no rows or no chosen patches", () => {
    expect(champStats([], new Set(["16.20"]))).toEqual([]);
    expect(champStats([row("Ahri", 0.5, 0.1)], new Set(["16.19"]))).toEqual([]);
  });

  it("gives every champion a tier and cuts tiers by the published shares", () => {
    const rows = Array.from({ length: 100 }, (_, i) => row(`C${i}`, 0.4 + i * 0.002, 0.05));
    const out = champStats(rows, new Set(["16.20"]));
    expect(out).toHaveLength(100);
    const counts = Object.fromEntries(TIERS.map(([t]) => [t, out.filter((c) => c.tier === t).length]));
    expect(counts).toEqual({ S: 8, A: 20, B: 32, C: 25, D: 15 });
    // sorted best first, and the best raw win rate is S
    expect(out[0].name).toBe("C99");
    expect(out[0].tier).toBe("S");
    expect(out.at(-1)!.tier).toBe("D");
  });

  it("does not let a rarely picked champion top the list on a few lucky games", () => {
    const rows = [
      ...Array.from({ length: 20 }, (_, i) => row(`C${i}`, 0.5 + i * 0.001, 0.1)),
      row("Lucky", 0.7, 0.0005),
      row("Solid", 0.56, 0.2),
    ];
    const out = champStats(rows, new Set(["16.20"]));
    expect(out[0].name).toBe("Solid");
    const lucky = out.find((c) => c.name === "Lucky")!;
    expect(lucky.score).toBeLessThan(0.6);
    expect(lucky.win_rate).toBeCloseTo(0.7);
  });

  it("weights patches by pick rate times days and keeps shares summing to 1", () => {
    const rows = [row("A", 0.6, 0.1, "16.19", 7), row("A", 0.4, 0.1, "16.20", 21), row("B", 0.5, 0.1, "16.19", 7), row("B", 0.5, 0.1, "16.20", 21)];
    const out = champStats(rows, new Set(["16.19", "16.20"]));
    const a = out.find((c) => c.name === "A")!;
    expect(a.win_rate).toBeCloseTo(0.45);
    expect(a.patches).toBe(2);
    expect(out.reduce((s, c) => s + c.share, 0)).toBeCloseTo(1);
  });

  it("ignores missing and non-finite stats instead of returning NaN", () => {
    const rows = [{ ...row("A", 0.5, 0.1), damage: 0.3 }, { ...row("A", 0.5, 0.1, "16.21"), damage: Number.NaN }];
    const [a] = champStats(rows, new Set(["16.20", "16.21"]));
    expect(a.damage).toBeCloseTo(0.3);
    expect(a.tank).toBeNull();
  });

  it("names the latest patch's augments and skips unknown ids", () => {
    const rows = [{ ...row("A", 0.5, 0.1), augs: "not-an-augment" }];
    expect(champStats(rows, new Set(["16.20"]))[0].top_augments).toBe("");
  });
});
