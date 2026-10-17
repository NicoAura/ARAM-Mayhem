"use client";

import { useEffect, useState } from "react";
import PlayerExtras from "./PlayerExtras";
import RiotIdFields from "./RiotIdFields";
import { ACCOUNT_EVENT, loadAccount, PROFILE_FRESH_MS, profileIcon as ICON, SERVERS, signIn, signOut as forget, type Profile } from "@/lib/account";

// The My Stats account lookup card. The account itself (stored Riot ID, lookup, clearing it) is shared
// with the header's account button through @/lib/account, so a lookup or clear in either updates both.

const QUEUES: Record<string, string> = { RANKED_SOLO_5x5: "Solo/Duo", RANKED_FLEX_SR: "Flex" };

const title = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

export default function RiotIdSignIn() {
  const [riotId, setRiotId] = useState("");
  const [platform, setPlatform] = useState("na1");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function lookUp(id: string, server: string) {
    setBusy(true);
    setError("");
    try {
      setProfile(await signIn(id, server));
    } catch (e) {
      setProfile(null);
      setError(e instanceof Error ? e.message : "Lookup failed");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    const sync = () => {
      const saved = loadAccount();
      if (!saved) {
        setProfile(null);
        setRiotId("");
        return;
      }
      setRiotId(saved.riotId);
      setPlatform(saved.platform);
      if (saved.profile) setProfile(saved.profile);
      return saved;
    };
    const saved = sync();
    if (saved && (!saved.profile || Date.now() - (saved.at ?? 0) > PROFILE_FRESH_MS)) lookUp(saved.riotId, saved.platform);
    window.addEventListener(ACCOUNT_EVENT, sync);
    return () => window.removeEventListener(ACCOUNT_EVENT, sync);
  }, []);

  function signOut() {
    forget();
  }

  if (profile) {
    const server = SERVERS.find(([v]) => v === profile.platform)?.[1] ?? profile.platform;
    return (
      <section className="card riot-id">
        <div className="riot-id-who">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={ICON(profile.profileIconId)} alt="" width={56} height={56} />
          <div>
            <p className="eyebrow">Account</p>
            <h2>
              {profile.gameName}
              <span>#{profile.tagLine}</span>
            </h2>
            <p className="sub">
              {server} · Level {profile.summonerLevel}
            </p>
          </div>
          <button type="button" className="btn ghost" onClick={signOut}>
            Clear lookup
          </button>
        </div>
        {(profile.ranked ?? []).length > 0 && (
          <dl className="riot-id-ranks">
            {profile.ranked
              .filter((r) => QUEUES[r.queueType])
              .map((r) => (
                <div key={r.queueType} className="rank-badge">
                  <dt>{QUEUES[r.queueType]}</dt>
                  <dd>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/assets/ranked/${r.tier.toLowerCase()}.png`} alt="" width={40} height={40} />
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
        {profile.puuid && <PlayerExtras puuid={profile.puuid} platform={profile.platform} />}
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
        <RiotIdFields riotId={riotId} onRiotId={setRiotId} platform={platform} onPlatform={setPlatform} />
        <button type="submit" className="btn" disabled={busy}>
          {busy ? "Looking up…" : "Look up"}
        </button>
      </form>
      <p className={error ? "riot-id-note error" : "riot-id-note"}>
        {error || "Your Riot ID is remembered in this browser only. No password needed; Riot IDs are public."}
      </p>
    </section>
  );
}
