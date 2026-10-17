"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ACCOUNT_EVENT, loadAccount, PROFILE_FRESH_MS, profileIcon, SERVERS, signIn, signOut, type Profile } from "@/lib/account";
import RiotIdFields from "./RiotIdFields";

// Top-right account button. Empty: a person icon that opens the Riot ID account lookup.
// After a lookup: the player's profile icon, with a menu holding My Stats and Clear lookup.

export default function AccountButton() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [riotId, setRiotId] = useState("");
  const [platform, setPlatform] = useState("na1");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sync = () => {
      const saved = loadAccount();
      setProfile(saved?.profile ?? null);
      if (saved) {
        setRiotId(saved.riotId);
        setPlatform(saved.platform);
      }
      return saved;
    };
    const saved = sync();
    // Refresh a stale or missing profile once per hour at most, quietly.
    if (saved && (!saved.profile || Date.now() - (saved.at ?? 0) > PROFILE_FRESH_MS)) signIn(saved.riotId, saved.platform).catch(() => {});
    window.addEventListener(ACCOUNT_EVENT, sync);
    return () => window.removeEventListener(ACCOUNT_EVENT, sync);
  }, []);

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await signIn(riotId, platform);
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lookup failed");
    } finally {
      setBusy(false);
    }
  }

  const server = profile && (SERVERS.find(([v]) => v === profile.platform)?.[1] ?? profile.platform);

  return (
    <div className="account" ref={box}>
      <button
        type="button"
        className={profile ? "account-btn signed-in" : "account-btn"}
        aria-label={profile ? `Account: ${profile.gameName}` : "Account lookup"}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((o) => !o)}
      >
        {profile ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={profileIcon(profile.profileIconId)} alt="" width={34} height={34} />
        ) : (
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="8" r="4" />
            <path d="M4 20a8 8 0 0 1 16 0" />
          </svg>
        )}
      </button>
      {open && (
        <div className="account-menu" role="dialog" aria-label={profile ? "Account" : "Account lookup"}>
          {profile ? (
            <>
              <div className="account-who">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={profileIcon(profile.profileIconId)} alt="" width={44} height={44} />
                <div>
                  <b>
                    {profile.gameName}
                    <span>#{profile.tagLine}</span>
                  </b>
                  <span>
                    {server} · Level {profile.summonerLevel}
                  </span>
                </div>
              </div>
              <Link href="/stats" className="account-item">
                My Stats
              </Link>
              <button type="button" className="account-item" onClick={() => (signOut(), setOpen(false))}>
                Clear lookup
              </button>
            </>
          ) : (
            <form className="account-form" method="post" action="/stats" onSubmit={submit}>
              <p className="account-title">Account lookup</p>
              <RiotIdFields riotId={riotId} onRiotId={setRiotId} platform={platform} onPlatform={setPlatform} autoFocus />
              <button type="submit" className="btn" disabled={busy}>
                {busy ? "Looking up…" : "Look up"}
              </button>
              <p className={error ? "account-note error" : "account-note"}>
                {error || "No password needed. Your Riot ID is remembered in this browser only."}
              </p>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
