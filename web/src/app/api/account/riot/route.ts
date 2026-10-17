import { handle, json } from "@/lib/account-route";
import { db, requireAccount } from "@/lib/accounts";
import { profileByPuuid, profilePath } from "@/lib/profiles";
import { getPlayerExtras, PLATFORMS, riotFetch, type Platform } from "@/lib/riot";

// GET /api/account/riot → for the signed-in account's connected Riot account: ranked standing, mastery,
// challenge standing and ARAM Clash team. Teammates who published a player page get a link to it and
// their most-played Mayhem champions. Nothing here looks up a player by name.
export const dynamic = "force-dynamic";

type Ranked = { queueType: string; tier: string; rank: string; leaguePoints: number; wins: number; losses: number };

export const GET = handle(async () => {
  const a = await requireAccount();
  const row = await (await db()).prepare("SELECT riot_puuid, riot_platform FROM accounts WHERE id = ?").bind(a.id).first<{ riot_puuid: string | null; riot_platform: string | null }>();
  if (!row?.riot_puuid || !row.riot_platform || !(row.riot_platform in PLATFORMS)) return json({ connected: false });
  const platform = row.riot_platform as Platform;
  const puuid = row.riot_puuid;
  const [extras, ranked] = await Promise.all([
    getPlayerExtras(platform, puuid),
    riotFetch<Ranked[]>(platform, `/lol/league/v4/entries/by-puuid/${encodeURIComponent(puuid)}`, 600).catch(() => [] as Ranked[]),
  ]);
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
  return json({
    connected: true,
    ranked: ranked.map(({ queueType, tier, rank, leaguePoints, wins, losses }) => ({ queueType, tier, rank, leaguePoints, wins, losses })),
    ...extras,
    clash,
  });
});
