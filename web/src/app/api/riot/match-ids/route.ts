import { NextRequest, NextResponse } from "next/server";
import { riotFetch, PLATFORMS, RiotError, type Platform } from "@/lib/riot";

// GET /api/riot/match-ids?puuid=...&platform=na1&queue=2400&start=0&count=100[&startTime=&endTime=]
// One page of a player's match ids from match-v5 (times in epoch seconds). The
// player lookup on My Stats pages through this; only the server sees RIOT_API_KEY.
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const puuid = params.get("puuid");
  const platform = (params.get("platform") ?? "na1").toLowerCase() as Platform;
  if (!puuid) return NextResponse.json({ error: "puuid is required" }, { status: 400 });
  if (!(platform in PLATFORMS)) {
    return NextResponse.json({ error: `platform must be one of ${Object.keys(PLATFORMS).join(", ")}` }, { status: 400 });
  }

  const query = new URLSearchParams();
  for (const key of ["queue", "start", "count", "startTime", "endTime"]) {
    const v = params.get(key);
    if (v === null) continue;
    if (!/^\d+$/.test(v)) return NextResponse.json({ error: `${key} must be a whole number` }, { status: 400 });
    query.set(key, key === "count" ? String(Math.min(100, +v)) : v);
  }

  try {
    const ids = await riotFetch<string[]>(
      PLATFORMS[platform],
      `/lol/match/v5/matches/by-puuid/${encodeURIComponent(puuid)}/ids?${query}`,
    );
    return NextResponse.json(ids);
  } catch (err) {
    const status = err instanceof RiotError ? err.status : 500;
    const message = err instanceof RiotError ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status });
  }
}
