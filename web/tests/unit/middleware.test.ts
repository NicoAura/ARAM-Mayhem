import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { config, middleware } from "@/middleware";

// Outside Cloudflare there are no rate-limit bindings, so these exercise the in-memory fallback.
const req = (ip: string, path = "/api/riot/account", method = "GET") =>
  new NextRequest(`https://deeparam.com${path}`, { method, headers: { "cf-connecting-ip": ip } });

describe("rate limits", () => {
  it("allows 30 lookups a minute per visitor, then answers 429 with Retry-After", async () => {
    for (let i = 0; i < 30; i++) expect((await middleware(req("1.1.1.1"))).status).toBe(200);
    const blocked = await middleware(req("1.1.1.1"));
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect((await blocked.json()).error).toMatch(/Too many/);
    // another visitor is unaffected
    expect((await middleware(req("2.2.2.2"))).status).toBe(200);
  });

  it("allows 10 leaderboard or profile sends a minute, counted apart from lookups", async () => {
    for (let i = 0; i < 10; i++) expect((await middleware(req("3.3.3.3", "/api/sim-scores", "POST"))).status).toBe(200);
    expect((await middleware(req("3.3.3.3", "/api/profile", "POST"))).status).toBe(429);
    expect((await middleware(req("3.3.3.3"))).status).toBe(200);
  });

  it("never limits reading the leaderboard", async () => {
    for (let i = 0; i < 50; i++) expect((await middleware(req("4.4.4.4", "/api/sim-scores"))).status).toBe(200);
  });

  it("lets My Stats share a 1,000-game archive in one go", async () => {
    for (let i = 0; i < 20; i++) expect((await middleware(req("5.5.5.5", "/api/games", "POST"))).status).toBe(200);
  });

  it("guards the lookups, error reports and write routes", () => {
    expect(config.matcher).toEqual(expect.arrayContaining(["/api/riot/:path*", "/api/log", "/api/sim-scores", "/api/profile", "/api/games"]));
  });

  it("guards the admin-only files", () => {
    expect(config.matcher).toEqual(
      expect.arrayContaining(["/assets/models/:path*", "/assets/clips/:path*", "/embed/simulator/full.html", "/embed/simulator/replay-data/sounds/:path*"]),
    );
  });
});
