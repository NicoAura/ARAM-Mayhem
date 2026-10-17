import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

// Per-visitor limits on the routes that cost something: the Riot lookups (the site's Riot API quota),
// browser error reports (/api/log, so they can't flood the logs), and the writes (leaderboard
// submissions, public profiles, shared games). On Cloudflare the counts come from the Worker's
// rate-limit bindings (wrangler.jsonc "ratelimits"), shared by every request in a location; elsewhere,
// or if a binding is missing, from this instance's memory, which is approximate.
type Rule = { binding: string; limit: number; message: string };
const LOOKUP: Rule = { binding: "RL_LOOKUP", limit: 30, message: "Too many lookups." };
const LOG: Rule = { binding: "RL_LOG", limit: 30, message: "Too many reports." };
const WRITE: Rule = { binding: "RL_WRITE", limit: 10, message: "Too many submissions." };
// My Stats sends a player's shared games 50 at a time, so a first share of 1,000 games is 20 requests.
const SHARE: Rule = { binding: "RL_SHARE", limit: 60, message: "Too many uploads." };
const WINDOW = 60_000; // all limits are per minute, matching the bindings' period

function ruleFor(req: NextRequest): Rule | null {
  const path = req.nextUrl.pathname;
  if (path.startsWith("/api/riot/")) return LOOKUP;
  if (path === "/api/log") return LOG;
  if (path === "/api/games") return SHARE;
  // GET /api/sim-scores is the public leaderboard, cached for a minute; only sending counts.
  if (req.method === "POST") return WRITE;
  return null;
}

type Limiter = { limit(o: { key: string }): Promise<{ success: boolean }> };
function binding(name: string): Limiter | null {
  try {
    const b = (getCloudflareContext().env as unknown as Record<string, unknown>)[name] as Limiter | undefined;
    return b && typeof b.limit === "function" ? b : null;
  } catch {
    return null; // not running on Cloudflare
  }
}

const hits = new Map<string, { n: number; reset: number }>();
function memoryAllows(key: string, limit: number) {
  const now = Date.now();
  if (hits.size > 5000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
  const h = hits.get(key);
  if (!h || h.reset < now) hits.set(key, { n: 1, reset: now + WINDOW });
  else if (++h.n > limit) return false;
  return true;
}

export async function middleware(req: NextRequest) {
  const rule = ruleFor(req);
  if (!rule) return NextResponse.next();
  const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const key = `${rule.binding}:${ip}`;
  const limiter = binding(rule.binding);
  let ok: boolean;
  try {
    ok = limiter ? (await limiter.limit({ key })).success : memoryAllows(key, rule.limit);
  } catch {
    ok = memoryAllows(key, rule.limit);
  }
  if (ok) return NextResponse.next();
  return NextResponse.json(
    { error: `${rule.message} Try again in a minute.` },
    { status: 429, headers: { "Retry-After": "60", "Cache-Control": "no-store" } },
  );
}

export const config = { matcher: ["/api/riot/:path*", "/api/log", "/api/sim-scores", "/api/profile", "/api/games"] };
