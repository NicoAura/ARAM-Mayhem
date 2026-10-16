import "server-only";

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
  const key = process.env.RIOT_API_KEY;
  if (!key) throw new RiotError("RIOT_API_KEY is not set on the server", 500);
  return key;
}

// Calls the Riot API with the key from the environment. Responses are cached
// by Next.js for `revalidate` seconds so repeat lookups don't spend rate limit.
export async function riotFetch<T>(
  region: Region,
  path: string,
  revalidate = 300,
): Promise<T> {
  const res = await fetch(`https://${region}.api.riotgames.com${path}`, {
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
