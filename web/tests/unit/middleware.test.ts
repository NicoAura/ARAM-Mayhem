import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { config, middleware } from "@/middleware";

const req = (ip: string) => new NextRequest("https://deeparam.com/api/riot/account", { headers: { "cf-connecting-ip": ip } });

describe("lookup rate limit", () => {
  it("allows 30 lookups a minute per visitor, then answers 429 with Retry-After", async () => {
    for (let i = 0; i < 30; i++) expect(middleware(req("1.1.1.1")).status).toBe(200);
    const blocked = middleware(req("1.1.1.1"));
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect((await blocked.json()).error).toMatch(/Too many/);
    // another visitor is unaffected
    expect(middleware(req("2.2.2.2")).status).toBe(200);
  });

  it("only guards the Riot lookups and error reports", () => {
    expect(config.matcher).toEqual(["/api/riot/:path*", "/api/log"]);
  });
});
