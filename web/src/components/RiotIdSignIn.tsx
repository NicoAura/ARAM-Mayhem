"use client";

import { useEffect, useState } from "react";

// Remembers a visitor's Riot ID in this browser and shows their account.
// Anyone can look up any Riot ID, so this identifies a player; it doesn't prove
// who's typing. Verified sign-in needs Riot Sign On, which Riot has to approve.

const STORE = "deeparam.riotId";
const SERVERS: [string, string][] = [
  ["na1", "NA"], ["euw1", "EUW"], ["eun1", "EUNE"], ["kr", "KR"], ["br1", "BR"], ["la1", "LAN"], ["la2", "LAS"],
  ["oc1", "OCE"], ["tr1", "TR"], ["ru", "RU"], ["jp1", "JP"], ["sg2", "SEA"], ["tw2", "TW"], ["vn2", "VN"],
];
const QUEUES: Record<string, string> = { RANKED_SOLO_5x5: "Solo/Duo", RANKED_FLEX_SR: "Flex" };
const ICON = (id: number) =>
  `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/profile-icons/${id}.jpg`;

type Ranked = { queueType: string; tier: string; rank: string; leaguePoints: number; wins: number; losses: number };
type Profile = { gameName: string; tagLine: string; platform: string; profileIconId: number; summonerLevel: number; ranked: Ranked[] };
type Saved = { riotId: string; platform: string };

function load(): Saved | null {
  try {
    const v = JSON.parse(localStorage.getItem(STORE) || "null");
    return v && typeof v.riotId === "string" ? v : null;
  } catch {
    return null;
  }
}

function save(v: Saved | null) {
  try {
    if (v) localStorage.setItem(STORE, JSON.stringify(v));
    else localStorage.removeItem(STORE);
  } catch {
    /* private mode: the session still works, it just isn't remembered */
  }
}

const title = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

export default function RiotIdSignIn() {
  const [riotId, setRiotId] = useState("");
  const [platform, setPlatform] = useState("na1");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function lookUp(id: string, server: string) {
    const [gameName, tagLine] = id.split("#").map((s) => s.trim());
    if (!gameName || !tagLine) {
      setError("Type your Riot ID with the #tag, like Name#NA1.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/riot/profile?${new URLSearchParams({ gameName, tagLine, platform: server })}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || `Lookup failed (${res.status})`);
      setProfile(body);
      save({ riotId: `${body.gameName}#${body.tagLine}`, platform: server });
    } catch (e) {
      setProfile(null);
      setError(e instanceof Error ? e.message : "Lookup failed");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    const saved = load();
    if (!saved) return;
    setRiotId(saved.riotId);
    setPlatform(saved.platform);
    lookUp(saved.riotId, saved.platform);
  }, []);

  function signOut() {
    save(null);
    setProfile(null);
    setRiotId("");
  }

  if (profile) {
    const server = SERVERS.find(([v]) => v === profile.platform)?.[1] ?? profile.platform;
    return (
      <section className="card riot-id">
        <div className="riot-id-who">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={ICON(profile.profileIconId)} alt="" width={56} height={56} />
          <div>
            <p className="eyebrow">Signed in as</p>
            <h2>
              {profile.gameName}
              <span>#{profile.tagLine}</span>
            </h2>
            <p className="sub">
              {server} · Level {profile.summonerLevel}
            </p>
          </div>
          <button type="button" className="btn ghost" onClick={signOut}>
            Sign out
          </button>
        </div>
        {profile.ranked.length > 0 && (
          <dl className="riot-id-ranks">
            {profile.ranked
              .filter((r) => QUEUES[r.queueType])
              .map((r) => (
                <div key={r.queueType}>
                  <dt>{QUEUES[r.queueType]}</dt>
                  <dd>
                    {title(r.tier)} {["MASTER", "GRANDMASTER", "CHALLENGER"].includes(r.tier) ? "" : r.rank} ·{" "}
                    {r.leaguePoints} LP
                    <span>
                      {r.wins}W {r.losses}L
                    </span>
                  </dd>
                </div>
              ))}
          </dl>
        )}
      </section>
    );
  }

  return (
    <section className="card riot-id">
      <form
        className="riot-id-form"
        onSubmit={(e) => {
          e.preventDefault();
          lookUp(riotId, platform);
        }}
      >
        <label className="riot-id-field">
          <span>Riot ID</span>
          <input
            value={riotId}
            onChange={(e) => setRiotId(e.target.value)}
            placeholder="Name#NA1"
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <label className="riot-id-field">
          <span>Server</span>
          <select value={platform} onChange={(e) => setPlatform(e.target.value)}>
            {SERVERS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn" disabled={busy}>
          {busy ? "Looking up…" : "Sign in"}
        </button>
      </form>
      <p className={error ? "riot-id-note error" : "riot-id-note"}>
        {error || "Your Riot ID is remembered in this browser only. No password needed; Riot IDs are public."}
      </p>
    </section>
  );
}
