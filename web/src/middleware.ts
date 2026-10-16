import { NextRequest, NextResponse } from "next/server";

// Per-visitor limit on the Riot lookup routes, so nobody can spend the site's Riot API quota.
// Counts live in each server instance's memory, so the limit is approximate; a Cloudflare
// rate-limiting rule on /api/riot/* would make it exact.
const LIMIT = 30; // requests
const WINDOW = 60_000; // per minute
const hits = new Map<string, { n: number; reset: number }>();

export function middleware(req: NextRequest) {
  const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const now = Date.now();
  if (hits.size > 5000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
  const h = hits.get(ip);
  if (!h || h.reset < now) hits.set(ip, { n: 1, reset: now + WINDOW });
  else if (++h.n > LIMIT) {
    const wait = Math.ceil((h.reset - now) / 1000);
    return NextResponse.json(
      { error: `Too many lookups. Try again in ${wait} seconds.` },
      { status: 429, headers: { "Retry-After": String(wait) } },
    );
  }
  return NextResponse.next();
}

export const config = { matcher: "/api/riot/:path*" };
