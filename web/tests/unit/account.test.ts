// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ACCOUNT_EVENT, ACCOUNT_STORE, loadAccount, saveAccount, signIn, SERVERS } from "@/lib/account";

describe("saved account", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.unstubAllGlobals());

  it("is empty when nothing or garbage is saved", () => {
    expect(loadAccount()).toBeNull();
    localStorage.setItem(ACCOUNT_STORE, "{not json");
    expect(loadAccount()).toBeNull();
    localStorage.setItem(ACCOUNT_STORE, JSON.stringify({ riotId: 5 }));
    expect(loadAccount()).toBeNull();
  });

  // Regression: a profile saved without a ranked list crashed My Stats (#84).
  it("drops a cached profile that has no ranked list but keeps the Riot ID", () => {
    localStorage.setItem(ACCOUNT_STORE, JSON.stringify({ riotId: "a#b", platform: "euw1", profile: { gameName: "a", tagLine: "b" } }));
    expect(loadAccount()).toEqual({ riotId: "a#b", platform: "euw1" });
  });

  it("defaults the server to NA when an old save has none", () => {
    localStorage.setItem(ACCOUNT_STORE, JSON.stringify({ riotId: "a#b", profile: { gameName: "a" } }));
    expect(loadAccount()?.platform).toBe("na1");
  });

  it("fires an event on every change so the header and My Stats stay in step", () => {
    const seen = vi.fn();
    window.addEventListener(ACCOUNT_EVENT, seen);
    saveAccount({ riotId: "a#b", platform: "na1" });
    saveAccount(null);
    expect(seen).toHaveBeenCalledTimes(2);
    expect(localStorage.getItem(ACCOUNT_STORE)).toBeNull();
  });

  it("asks for the tag before calling the server", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(signIn("NoTag", "na1")).rejects.toThrow(/tag/);
    await expect(signIn("#NA1", "na1")).rejects.toThrow(/tag/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("saves a lookup with a missing ranked list as an empty list", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ gameName: "Nico", tagLine: "damn", profileIconId: 1, summonerLevel: 30 }))));
    const p = await signIn(" Nico # damn ", "na1");
    expect(p.ranked).toEqual([]);
    expect(loadAccount()?.riotId).toBe("Nico#damn");
  });

  it("shows the server's error message on a failed lookup", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "Riot ID not found" }), { status: 404 })));
    await expect(signIn("x#y", "na1")).rejects.toThrow("Riot ID not found");
  });

  it("lists every region once", () => {
    const ids = SERVERS.map(([id]) => id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(expect.arrayContaining(["na1", "euw1", "kr", "sg2"]));
  });
});
