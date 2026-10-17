// The visitor's Riot ID "account", shared by the header's account button and the My Stats account lookup.
// It lives in this browser's localStorage; every change fires ACCOUNT_EVENT so both stay in step.
// Anyone can look up any Riot ID, so this identifies a player; it doesn't prove who's typing.

export const ACCOUNT_STORE = "deeparam.riotId";
export const ACCOUNT_EVENT = "deeparam-account";

/** Every League region: [platform id the server routes by, label]. PH and TH play on the SEA (sg2) servers. */
export const SERVERS: [string, string][] = [
  ["na1", "NA"], ["euw1", "EUW"], ["eun1", "EUNE"], ["kr", "KR"], ["br1", "BR"], ["la1", "LAN"], ["la2", "LAS"],
  ["oc1", "OCE"], ["jp1", "JP"], ["tr1", "TR"], ["ru", "RU"], ["ph2", "PH"], ["sg2", "SG"], ["th2", "TH"],
  ["tw2", "TW"], ["vn2", "VN"], ["me1", "ME"],
];

export const profileIcon = (id: number) => `/assets/profile-icon/${id}.jpg`;

export type Ranked = { queueType: string; tier: string; rank: string; leaguePoints: number; wins: number; losses: number };
export type Profile = { puuid?: string; gameName: string; tagLine: string; platform: string; profileIconId: number; summonerLevel: number; ranked: Ranked[] };
/** `profile` and `at` cache the last lookup so the header doesn't call Riot on every page. */
export type Saved = { riotId: string; platform: string; profile?: Profile; at?: number };

export const PROFILE_FRESH_MS = 60 * 60 * 1000;

export function loadAccount(): Saved | null {
  try {
    const v = JSON.parse(localStorage.getItem(ACCOUNT_STORE) || "null");
    if (!v || typeof v.riotId !== "string") return null;
    // A profile cached by an older version (or a partial lookup) is dropped, so it's fetched again.
    const p = v.profile;
    if (p && (typeof p.gameName !== "string" || !Array.isArray(p.ranked))) return { riotId: v.riotId, platform: v.platform ?? "na1" };
    return v;
  } catch {
    return null;
  }
}

export function saveAccount(v: Saved | null) {
  try {
    if (v) localStorage.setItem(ACCOUNT_STORE, JSON.stringify(v));
    else localStorage.removeItem(ACCOUNT_STORE);
  } catch {
    /* private mode: the session still works, it just isn't remembered */
  }
  window.dispatchEvent(new Event(ACCOUNT_EVENT));
}

/** Looks up a Riot ID ("Name#TAG") on a server and remembers it as the signed-in account. */
export async function signIn(riotId: string, platform: string): Promise<Profile> {
  const [gameName, tagLine] = riotId.split("#").map((s) => s.trim());
  if (!gameName || !tagLine) throw new Error("Enter your name and your tag (the part after #, like NA1).");
  const res = await fetch(`/api/riot/profile?${new URLSearchParams({ gameName, tagLine, platform })}`);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Lookup failed (${res.status})`);
  const profile = { ...body, ranked: Array.isArray(body.ranked) ? body.ranked : [] } as Profile;
  saveAccount({ riotId: `${profile.gameName}#${profile.tagLine}`, platform, profile, at: Date.now() });
  return profile;
}

export const signOut = () => saveAccount(null);
