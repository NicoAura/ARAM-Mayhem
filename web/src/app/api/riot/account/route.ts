import { NextRequest, NextResponse } from "next/server";
import { getAccountByRiotId, REGIONS, RiotError, type Region } from "@/lib/riot";

// GET /api/riot/account?gameName=Name&tagLine=NA1&region=americas
// The browser calls this route; only the server sees RIOT_API_KEY.
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const gameName = params.get("gameName");
  const tagLine = params.get("tagLine");
  const region = (params.get("region") ?? "americas") as Region;

  if (!gameName || !tagLine) {
    return NextResponse.json({ error: "gameName and tagLine are required" }, { status: 400 });
  }
  if (!REGIONS.includes(region)) {
    return NextResponse.json({ error: `region must be one of ${REGIONS.join(", ")}` }, { status: 400 });
  }

  try {
    return NextResponse.json(await getAccountByRiotId(region, gameName, tagLine));
  } catch (err) {
    const status = err instanceof RiotError ? err.status : 500;
    const message = err instanceof RiotError ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status });
  }
}
