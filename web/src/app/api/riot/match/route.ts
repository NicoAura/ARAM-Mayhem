import { NextRequest, NextResponse } from "next/server";
import { riotFetch, PLATFORMS, RiotError, type Platform } from "@/lib/riot";

// GET /api/riot/match?id=NA1_123&platform=na1
// One match from match-v5, for player lookups. Only the server sees RIOT_API_KEY.
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const id = params.get("id") ?? "";
  const platform = (params.get("platform") ?? "na1").toLowerCase() as Platform;
  if (!/^[A-Z0-9]+_\d+$/.test(id)) return NextResponse.json({ error: "id must look like NA1_1234567890" }, { status: 400 });
  if (!(platform in PLATFORMS)) {
    return NextResponse.json({ error: `platform must be one of ${Object.keys(PLATFORMS).join(", ")}` }, { status: 400 });
  }
  try {
    const match = await riotFetch<unknown>(PLATFORMS[platform], `/lol/match/v5/matches/${encodeURIComponent(id)}`);
    return NextResponse.json(match);
  } catch (err) {
    const status = err instanceof RiotError ? err.status : 500;
    const message = err instanceof RiotError ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status });
  }
}
