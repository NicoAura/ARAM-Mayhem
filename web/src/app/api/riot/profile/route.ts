import { NextRequest, NextResponse } from "next/server";
import { getProfileByRiotId, PLATFORMS, RiotError, type Platform } from "@/lib/riot";

// GET /api/riot/profile?gameName=Name&tagLine=NA1&platform=na1
// My Stats calls this for the Riot ID a visitor enters; only the server sees RIOT_API_KEY.
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const gameName = params.get("gameName");
  const tagLine = params.get("tagLine");
  const platform = (params.get("platform") ?? "na1").toLowerCase() as Platform;

  if (!gameName || !tagLine) {
    return NextResponse.json({ error: "gameName and tagLine are required" }, { status: 400 });
  }
  if (!(platform in PLATFORMS)) {
    return NextResponse.json({ error: `platform must be one of ${Object.keys(PLATFORMS).join(", ")}` }, { status: 400 });
  }

  try {
    return NextResponse.json(await getProfileByRiotId(platform, gameName, tagLine));
  } catch (err) {
    const status = err instanceof RiotError ? err.status : 500;
    const message = err instanceof RiotError ? (status === 404 ? "No player with that Riot ID on this server" : err.message) : "Unexpected error";
    return NextResponse.json({ error: message }, { status });
  }
}
