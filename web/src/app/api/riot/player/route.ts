import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-session";
import { profileByPuuid, profilePath } from "@/lib/profiles";
import { getPlayerExtras, PLATFORMS, type Platform } from "@/lib/riot";

// GET /api/riot/player?platform=na1&puuid=...
// My Stats calls this after a Riot ID lookup for mastery, challenge standing and the player's ARAM Clash team.
// Clash teammates who published a public page get a link to it and their most-played Mayhem champions.
// No looking up other players without signing in: until Riot account sign-in exists, only the admin can call it.
export async function GET(req: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Sign in to see your account" }, { status: 403 });
  }
  const params = req.nextUrl.searchParams;
  const puuid = params.get("puuid") ?? "";
  const platform = (params.get("platform") ?? "na1").toLowerCase() as Platform;

  if (!/^[\w-]{20,100}$/.test(puuid)) {
    return NextResponse.json({ error: "puuid is required" }, { status: 400 });
  }
  if (!(platform in PLATFORMS)) {
    return NextResponse.json({ error: `platform must be one of ${Object.keys(PLATFORMS).join(", ")}` }, { status: 400 });
  }

  try {
    const extras = await getPlayerExtras(platform, puuid);
    const clash = extras.clash && {
      ...extras.clash,
      members: await Promise.all(
        extras.clash.members.map(async ({ puuid: id, ...m }) => {
          const page = await profileByPuuid(id).catch(() => null);
          return {
            ...m,
            page: page ? profilePath(page.platform, page.name, page.tag) : null,
            mayhem: page ? page.data.champions.slice(0, 3).map((c) => ({ championId: c.id, games: c.n, wins: c.w })) : [],
          };
        }),
      ),
    };
    return NextResponse.json({ ...extras, clash });
  } catch {
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
