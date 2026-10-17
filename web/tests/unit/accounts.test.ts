import { describe, expect, it } from "vitest";
import { checkPasswordHash, cleanData, cleanEmail, cleanPassword, hashPassword } from "@/lib/accounts";
import { ownerFromCookie } from "@/lib/admin-session";

describe("account passwords", () => {
  it("stores a salted hash that checks only the right password", async () => {
    const stored = await hashPassword("correct horse battery");
    expect(stored).toMatch(/^pbkdf2\$100000\$/);
    expect(stored).not.toContain("correct horse");
    expect(await hashPassword("correct horse battery")).not.toBe(stored); // a new salt each time
    expect(await checkPasswordHash("correct horse battery", stored)).toBe(true);
    expect(await checkPasswordHash("correct horse batterY", stored)).toBe(false);
    expect(await checkPasswordHash("anything", null)).toBe(false);
  });

  it("asks for a real email and a long enough password", () => {
    expect(cleanEmail("  Nico@Example.com ")).toBe("nico@example.com");
    expect(() => cleanEmail("not an email")).toThrow(/valid email/);
    expect(() => cleanPassword("short")).toThrow(/10 characters/);
    expect(cleanPassword("long enough pw")).toBe("long enough pw");
  });
});

describe("synced account data", () => {
  it("keeps only champion ids and known settings of the right type", () => {
    const d = cleanData({
      favorites: ["Ahri", "Ahri", "<script>", 5, "Kai'Sa"],
      settings: { sound: false, motion: "reduce", graphics: 3, evil: "x" },
      extra: "dropped",
    });
    expect(d).toEqual({ favorites: ["Ahri", "Kai'Sa"], settings: { sound: false, motion: "reduce" } });
    expect(cleanData(null)).toEqual({ favorites: [], settings: {} });
  });
});

describe("owner-only files", () => {
  it("stay closed without a signed-in owner session", async () => {
    expect(await ownerFromCookie(undefined)).toBe(false);
    expect(await ownerFromCookie("not-a-session")).toBe(false);
    expect(await ownerFromCookie("x".repeat(43))).toBe(false); // no accounts database outside Cloudflare
  });
});

describe("challenge tokens and title on the account page", async () => {
  const { shownOff } = await import("@/lib/riot");
  it("names the shown tokens at their level and the picked title", () => {
    const got = shownOff({ challengeIds: [101000, 999999999], title: "10100006" }, [
      { challengeId: 101000, level: "MASTER", value: 1, percentile: 0.1 },
    ]);
    expect(got.title).toBe("ARAM God");
    expect(got.tokens).toEqual([{ id: 101000, name: "ARAM Authority", description: expect.any(String), level: "MASTER" }]);
  });
  it("shows nothing when the player picked nothing", () => {
    expect(shownOff(undefined, [])).toEqual({ tokens: [], title: null });
  });
});
