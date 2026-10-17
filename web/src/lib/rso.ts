import "server-only";
import { serverEnv } from "./env";
import { PLATFORMS, riotFetch, type Platform } from "./riot";

// Sign in with Riot (Riot Sign-On, OAuth 2). It stays off until the production key's RSO client exists:
// the flag is the RSO_CLIENT_ID and RSO_CLIENT_SECRET secrets being set on the Worker. The redirect URI
// registered with Riot is https://deeparam.com/api/account/rso/callback.

const AUTH = "https://auth.riotgames.com";

export const rsoEnabled = () => Boolean(serverEnv("RSO_CLIENT_ID") && serverEnv("RSO_CLIENT_SECRET"));

export const redirectUri = (origin: string) => `${origin}/api/account/rso/callback`;

export function authorizeUrl(origin: string, state: string): string {
  const q = new URLSearchParams({
    client_id: serverEnv("RSO_CLIENT_ID") ?? "",
    redirect_uri: redirectUri(origin),
    response_type: "code",
    // cpid: the id token names the player's server, so the account page knows where to ask for their rank.
    scope: "openid cpid",
    state,
  });
  return `${AUTH}/authorize?${q}`;
}

export class RsoError extends Error {}

/** The Riot account that just signed in: trades the one-time code for tokens, then asks who it is. */
export async function rsoAccount(origin: string, code: string): Promise<{ puuid: string; name: string; tag: string; platform: Platform | null }> {
  const basic = btoa(`${serverEnv("RSO_CLIENT_ID")}:${serverEnv("RSO_CLIENT_SECRET")}`);
  const tok = await fetch(`${AUTH}/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri(origin) }),
  });
  if (!tok.ok) throw new RsoError(`token ${tok.status}`);
  const { access_token, id_token } = (await tok.json()) as { access_token?: string; id_token?: string };
  if (!access_token) throw new RsoError("no access token");
  const me = await fetch("https://americas.api.riotgames.com/riot/account/v1/accounts/me", { headers: { Authorization: `Bearer ${access_token}` } });
  if (!me.ok) throw new RsoError(`accounts/me ${me.status}`);
  const acct = (await me.json()) as { puuid: string; gameName?: string; tagLine?: string };
  if (!acct.puuid) throw new RsoError("no puuid");
  return { puuid: acct.puuid, name: acct.gameName ?? "", tag: acct.tagLine ?? "", platform: (await platformOf(id_token, acct.puuid)) ?? null };
}

/** The player's League server: the id token's cpid claim, else the API's active region for League. */
async function platformOf(idToken: string | undefined, puuid: string): Promise<Platform | null> {
  const known = (p: unknown) => (typeof p === "string" && p.toLowerCase() in PLATFORMS ? (p.toLowerCase() as Platform) : null);
  try {
    // The id token came straight from Riot over TLS in the step before, so its claims are read as they are.
    const part = (idToken ?? "").split(".")[1] ?? "";
    const claims = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=")));
    const cpid = known(claims.cpid);
    if (cpid) return cpid;
  } catch {}
  const r = await riotFetch<{ region?: string }>("americas", `/riot/account/v1/region/by-game/lol/by-puuid/${encodeURIComponent(puuid)}`, 3600).catch(() => null);
  return known(r?.region);
}
