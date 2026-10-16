import "server-only";
import { serverEnv } from "./env";

// Regional routing values used by the account-v1 and match-v5 APIs.
export const REGIONS = ["americas", "europe", "asia", "sea"] as const;
export type Region = (typeof REGIONS)[number];

export class RiotError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

function apiKey(): string {
  const key = serverEnv("RIOT_API_KEY");
  if (!key) throw new RiotError("RIOT_API_KEY is not set on the server", 500);
  return key;
}

// Calls the Riot API with the key from the environment. Responses are cached
// by Next.js for `revalidate` seconds so repeat lookups don't spend rate limit.
export async function riotFetch<T>(
  host: Region | Platform,
  path: string,
  revalidate = 300,
): Promise<T> {
  const res = await fetch(`https://${host}.api.riotgames.com${path}`, {
    headers: { "X-Riot-Token": apiKey() },
    next: { revalidate },
  });
  if (!res.ok) {
    throw new RiotError(`Riot API returned ${res.status}`, res.status);
  }
  return res.json() as Promise<T>;
}

export type Account = { puuid: string; gameName: string; tagLine: string };

export function getAccountByRiotId(region: Region, gameName: string, tagLine: string) {
  return riotFetch<Account>(
    region,
    `/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`,
  );
}

// Platform routing values (one per server) and the regional host each one's accounts live on.
export const PLATFORMS = {
  na1: "americas", br1: "americas", la1: "americas", la2: "americas",
  euw1: "europe", eun1: "europe", tr1: "europe", ru: "europe",
  kr: "asia", jp1: "asia",
  oc1: "sea", sg2: "sea", tw2: "sea", vn2: "sea",
} as const satisfies Record<string, Region>;
export type Platform = keyof typeof PLATFORMS;

export type ChallengeProgress = { challenges: { challengeId: number; level: string; value: number; percentile: number }[] };

/** A player's challenge progress (challenges-v1), looked up by Riot ID. */
export async function getChallengesByRiotId(platform: Platform, gameName: string, tagLine: string) {
  const { puuid } = await getAccountByRiotId(PLATFORMS[platform], gameName, tagLine);
  return riotFetch<ChallengeProgress>(platform, `/lol/challenges/v1/player-data/${encodeURIComponent(puuid)}`);
}

export type RankedEntry = { queueType: string; tier: string; rank: string; leaguePoints: number; wins: number; losses: number };
export type Profile = Account & { platform: Platform; profileIconId: number; summonerLevel: number; ranked: RankedEntry[] };

/** Account, level, icon and ranked standing for a Riot ID on one server. */
export async function getProfileByRiotId(platform: Platform, gameName: string, tagLine: string): Promise<Profile> {
  const account = await getAccountByRiotId(PLATFORMS[platform], gameName, tagLine);
  const id = encodeURIComponent(account.puuid);
  const [summoner, ranked] = await Promise.all([
    riotFetch<{ profileIconId: number; summonerLevel: number }>(platform, `/lol/summoner/v4/summoners/by-puuid/${id}`),
    riotFetch<RankedEntry[]>(platform, `/lol/league/v4/entries/by-puuid/${id}`).catch(() => []),
  ]);
  return {
    ...account,
    platform,
    profileIconId: summoner.profileIconId,
    summonerLevel: summoner.summonerLevel,
    ranked: ranked.map(({ queueType, tier, rank, leaguePoints, wins, losses }) => ({ queueType, tier, rank, leaguePoints, wins, losses })),
  };
}
