import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { inDays, longDate, nextPatch, type PatchSchedule } from "@/lib/patch-schedule";

const schedule = JSON.parse(readFileSync("../data/patch-schedule.json", "utf8")) as PatchSchedule;

describe("patch countdown", () => {
  it("counts whole days to the next patch in Pacific Time", () => {
    // 18:00 UTC on Oct 17 is still Oct 17 in Los Angeles.
    expect(nextPatch(schedule, new Date("2026-10-17T18:00:00Z"))).toEqual({ patch: "26.21", date: "2026-10-21", days: 4 });
  });

  it("uses the Pacific date, not the UTC one, late in the evening", () => {
    // 05:00 UTC on Oct 21 is 22:00 on Oct 20 in Los Angeles: one day to go.
    expect(nextPatch(schedule, new Date("2026-10-21T05:00:00Z"))?.days).toBe(1);
  });

  it("shows patch day as today, then moves on to the next patch", () => {
    expect(nextPatch(schedule, new Date("2026-10-21T20:00:00Z"))).toMatchObject({ patch: "26.21", days: 0 });
    expect(nextPatch(schedule, new Date("2026-10-22T20:00:00Z"))?.patch).toBe("26.22");
  });

  it("shows nothing once the published list runs out", () => {
    expect(nextPatch(schedule, new Date("2026-12-20T20:00:00Z"))).toBeNull();
  });

  it("words the dates for players", () => {
    expect([inDays(0), inDays(1), inDays(4)]).toEqual(["today", "tomorrow", "in 4 days"]);
    expect(longDate("2026-10-21")).toBe("Wednesday, October 21");
  });
});
