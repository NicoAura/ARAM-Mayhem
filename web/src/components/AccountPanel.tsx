"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { browserSupportsWebAuthn, startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { ACCOUNT_EVENT, forgetAccount, syncAccount } from "@/lib/account-sync";
import { useBotCheck } from "@/lib/bot-check-client";
import PlayerExtras from "./PlayerExtras";

// The account page (/account): sign in or create an account, then manage it. Favorites and settings
// sync on their own (lib/account-sync.ts); this page covers passkeys, the password, the connected Riot
// account, the owner tools and deleting the account.

type Account = {
  signedIn: true;
  id: string;
  email: string | null;
  hasPassword: boolean;
  owner: boolean;
  canClaimOwner: boolean;
  data: { favorites: string[] };
  passkeys: { id: string; label: string; created: string }[];
  riot: { name: string; platform: string | null; page: string | null } | null;
  passkeySession: boolean;
  /** Sign in with Riot is switched on (lib/rso.ts). */
  rso: boolean;
  /** Sign in with Google or Apple: the ones switched on (lib/oauth.ts), and the ones this account uses. */
  providers: Provider[];
  logins: { provider: Provider; name: string; email: string | null }[];
};

type Provider = "google" | "apple" | "discord" | "twitch" | "microsoft" | "steam" | "facebook" | "x" | "github";
const PROVIDER_NAMES: Record<Provider, string> = {
  google: "Google",
  apple: "Apple",
  discord: "Discord",
  twitch: "Twitch",
  microsoft: "Microsoft",
  steam: "Steam",
  facebook: "Facebook",
  x: "X",
  github: "GitHub",
};
// Shown as buttons; the rest sit under "More".
const MAIN: Provider[] = ["google", "apple", "discord", "twitch"];

/** Buttons for the sign-in services that are switched on: Riot and the main ones, then a "More" menu. */
function ProviderButtons({ providers, rso, mode }: { providers: Provider[]; rso: boolean; mode: "signin" | "connect" }) {
  const main = providers.filter((p) => MAIN.includes(p));
  const more = providers.filter((p) => !MAIN.includes(p));
  const label = (name: string) => (mode === "signin" ? `Continue with ${name}` : `Connect ${name}`);
  const link = (p: Provider) => (
    <a key={p} className="btn ghost acct-provider" href={`/api/account/oauth/${p}/start?mode=${mode}`}>
      {label(PROVIDER_NAMES[p])}
    </a>
  );
  return (
    <>
      {rso && (
        <a className="btn ghost acct-provider" href={`/api/account/rso/start?mode=${mode}`}>
          {label("Riot")}
        </a>
      )}
      {main.map(link)}
      {more.length > 0 && (
        <details className="acct-more">
          <summary>More ways to {mode === "signin" ? "sign in" : "connect"}</summary>
          <div>{more.map(link)}</div>
        </details>
      )}
    </>
  );
}

type Msg = { kind: "ok" | "error"; text: string } | null;

async function call(path: string, method: string, payload?: unknown) {
  const res = await fetch(path, {
    method,
    headers: payload === undefined ? undefined : { "content-type": "application/json" },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({ error: "Something went wrong. Try again." }));
  if (!res.ok) throw new Error(data.error ?? "Something went wrong. Try again.");
  return data;
}

const errText = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong. Try again.");
// Passkey prompts the visitor closes on purpose aren't errors worth showing.
const cancelled = (e: unknown) => e instanceof Error && /NotAllowedError|AbortError|cancel/i.test(`${e.name} ${e.message}`);

function Note({ msg }: { msg: Msg }) {
  return msg ? <p className={`acct-note ${msg.kind}`} role={msg.kind === "error" ? "alert" : "status"}>{msg.text}</p> : null;
}

export default function AccountPanel() {
  const [account, setAccount] = useState<Account | null | undefined>(undefined);
  const [rso, setRso] = useState(false);
  const [providers, setProviders] = useState<Provider[]>([]);
  // Coming back from Sign in with Riot: /account?riot=connected or ?riot-error=<what went wrong>.
  const [riotMsg, setRiotMsg] = useState<Msg>(null);

  const refresh = useCallback(async () => {
    const a = await fetch("/api/account", { cache: "no-store" }).then((r) => r.json()).catch(() => null);
    setRso(Boolean(a?.rso));
    setProviders(Array.isArray(a?.providers) ? a.providers : []);
    setAccount(a?.signedIn ? a : null);
  }, []);

  useEffect(() => {
    void refresh();
    const q = new URLSearchParams(location.search);
    const error = q.get("riot-error") ?? q.get("signin-error");
    if (error || q.get("riot") === "connected") {
      setRiotMsg(error ? { kind: "error", text: error.slice(0, 200) } : { kind: "ok", text: "Your Riot account is connected." });
      history.replaceState(null, "", location.pathname);
      if (!error) void syncAccount().then(() => window.dispatchEvent(new Event(ACCOUNT_EVENT)));
    }
  }, [refresh]);

  const signedIn = async () => {
    await syncAccount();
    window.dispatchEvent(new Event(ACCOUNT_EVENT));
    await refresh();
  };

  if (account === undefined) return <p className="acct-loading">Loading your account…</p>;
  return (
    <>
      <Note msg={riotMsg} />
      {account ? <Manage account={account} refresh={refresh} /> : <SignIn onDone={signedIn} rso={rso} providers={providers} />}
    </>
  );
}

function SignIn({ onDone, rso, providers }: { onDone: () => Promise<void>; rso: boolean; providers: Provider[] }) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [passkeys, setPasskeys] = useState(false);
  const bot = useBotCheck();

  useEffect(() => setPasskeys(browserSupportsWebAuthn()), []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await call(`/api/account/${mode}`, "POST", { email, password, check: bot.token });
      await onDone();
    } catch (err) {
      setMsg({ kind: "error", text: errText(err) });
      bot.reset();
    } finally {
      setBusy(false);
    }
  };

  const passkey = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const options = await call("/api/account/passkey", "POST", { step: "signin-options" });
      const response = await startAuthentication({ optionsJSON: options });
      await call("/api/account/passkey", "POST", { step: "signin", response });
      await onDone();
    } catch (err) {
      if (!cancelled(err)) setMsg({ kind: "error", text: errText(err) });
    } finally {
      setBusy(false);
    }
  };

  const signup = mode === "signup";
  return (
    <div className="acct-signin card">
      <div className="acct-tabs" role="tablist" aria-label="Sign in or create an account">
        {(["signin", "signup"] as const).map((m) => (
          <button key={m} type="button" role="tab" aria-selected={mode === m} className={mode === m ? "active" : ""} onClick={() => (setMode(m), setMsg(null))}>
            {m === "signin" ? "Sign in" : "Create account"}
          </button>
        ))}
      </div>
      <form className="acct-form" method="post" action="/account" onSubmit={submit}>
        <label>
          Email
          <input type="email" name="email" autoComplete={signup ? "email" : "username webauthn"} required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Password
          <input
            type="password"
            name="password"
            autoComplete={signup ? "new-password" : "current-password"}
            required
            minLength={signup ? 10 : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {signup && <p className="acct-hint">At least 10 characters. A passphrase of a few words works well.</p>}
        <div ref={bot.box} className="acct-botcheck" />
        <button type="submit" className="btn" disabled={busy}>
          {busy ? "One moment…" : signup ? "Create account" : "Sign in"}
        </button>
      </form>
      {(passkeys || rso || providers.length > 0) && <p className="acct-or">or</p>}
      {passkeys && (
        <button type="button" className="btn ghost acct-passkey" onClick={passkey} disabled={busy}>
          Sign in with a passkey
        </button>
      )}
      <ProviderButtons providers={providers} rso={rso} mode="signin" />
      <Note msg={msg} />
      <p className="acct-hint">
        {signup
          ? "Your starred champions and settings will follow you to every browser you sign in on."
          : "Forgot your password? Sign in with a passkey, then set a new one here."}
      </p>
    </div>
  );
}

function Manage({ account, refresh }: { account: Account; refresh: () => Promise<void> }) {
  const signOut = async () => {
    await call("/api/account/signout", "POST").catch(() => null);
    forgetAccount();
    await refresh();
  };

  return (
    <div className="acct-grid">
      <section className="card acct-card">
        <h2>Signed in</h2>
        <p className="acct-who">{account.email ?? account.riot?.name ?? "Your account"}</p>
        <p className="acct-hint">
          Your {account.data.favorites.length ? `${account.data.favorites.length} starred champion${account.data.favorites.length === 1 ? "" : "s"}` : "starred champions"} and
          settings follow you to every browser you sign in on.
        </p>
        <button type="button" className="btn ghost" onClick={signOut}>
          Sign out
        </button>
      </section>
      <RiotCard account={account} refresh={refresh} />
      <PasskeyCard account={account} refresh={refresh} />
      {(account.providers.length > 0 || account.logins.length > 0) && <ProvidersCard account={account} refresh={refresh} />}
      <PasswordCard account={account} />
      {(account.owner || account.canClaimOwner) && <OwnerCard account={account} refresh={refresh} />}
      <DeleteCard account={account} refresh={refresh} />
      {account.riot && <PlayerExtras />}
    </div>
  );
}

function RiotCard({ account, refresh }: { account: Account; refresh: () => Promise<void> }) {
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<Msg>(null);

  const getCode = async () => {
    setMsg(null);
    try {
      setCode((await call("/api/account/riot-code", "POST")).code);
    } catch (err) {
      setMsg({ kind: "error", text: errText(err) });
    }
  };

  const disconnect = async () => {
    try {
      await call("/api/account/riot-code", "DELETE");
      await refresh();
    } catch (err) {
      setMsg({ kind: "error", text: errText(err) });
    }
  };

  return (
    <section className="card acct-card">
      <h2>Riot account</h2>
      {account.riot ? (
        <>
          <p className="acct-who">{account.riot.name}</p>
          {account.riot.page ? (
            <p>
              <Link className="inline-link" href={account.riot.page}>
                Your player page
              </Link>
            </p>
          ) : (
            <p className="acct-hint">Publish a player page from My Stats and it links here.</p>
          )}
          <button type="button" className="btn ghost" onClick={disconnect}>
            Disconnect
          </button>
        </>
      ) : code ? (
        <>
          <p className="acct-code" aria-label={`Your code: ${code.split("").join(" ")}`}>
            {code.slice(0, 4)} {code.slice(4)}
          </p>
          <ol className="acct-steps">
            <li>
              Open{" "}
              <Link className="inline-link" href="/stats">
                My Stats
              </Link>{" "}
              on the computer where you play, with the Riot Client signed in.
            </li>
            <li>Choose Connect account and enter this code. It works for 15 minutes.</li>
            <li>
              Come back here and{" "}
              <button type="button" className="inline-link" onClick={() => void refresh()}>
                refresh
              </button>
              .
            </li>
          </ol>
        </>
      ) : (
        <>
          <p className="acct-hint">Connect the Riot account you play on. My Stats confirms it with the Riot Client on your computer, so only you can connect yours.</p>
          <button type="button" className="btn" onClick={getCode}>
            Connect a Riot account
          </button>
          {account.rso ? (
            <a className="btn ghost" href="/api/account/rso/start?mode=connect">
              Connect with Riot sign-in
            </a>
          ) : (
            <p className="acct-hint">Coming soon: connect straight from this page with your Riot sign-in.</p>
          )}
        </>
      )}
      <Note msg={msg} />
    </section>
  );
}

function ProvidersCard({ account, refresh }: { account: Account; refresh: () => Promise<void> }) {
  const [msg, setMsg] = useState<Msg>(null);
  const remove = async (provider: Provider) => {
    setMsg(null);
    try {
      await call("/api/account/oauth/disconnect", "POST", { provider });
      await refresh();
    } catch (err) {
      setMsg({ kind: "error", text: errText(err) });
    }
  };
  const missing = account.providers.filter((p) => !account.logins.some((l) => l.provider === p));

  return (
    <section className="card acct-card">
      <h2>Other ways to sign in</h2>
      <p className="acct-hint">Sign in to this account with another service you use, instead of a password.</p>
      {account.logins.length > 0 && (
        <ul className="acct-list">
          {account.logins.map((l) => (
            <li key={l.provider}>
              <span>
                {l.name}
                {l.email && <small>{l.email}</small>}
              </span>
              <button type="button" className="inline-link" onClick={() => remove(l.provider)} aria-label={`Stop signing in with ${l.name}`}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <ProviderButtons providers={missing} rso={false} mode="connect" />
      <Note msg={msg} />
    </section>
  );
}

function PasskeyCard({ account, refresh }: { account: Account; refresh: () => Promise<void> }) {
  const [msg, setMsg] = useState<Msg>(null);
  const [supported, setSupported] = useState(true);
  useEffect(() => setSupported(browserSupportsWebAuthn()), []);

  const add = async () => {
    setMsg(null);
    try {
      const options = await call("/api/account/passkey", "POST", { step: "add-options" });
      const response = await startRegistration({ optionsJSON: options });
      const label = /iPhone|iPad|Mac/.test(navigator.userAgent) ? "Apple device" : /Android/.test(navigator.userAgent) ? "Android phone" : /Windows/.test(navigator.userAgent) ? "Windows PC" : "Passkey";
      await call("/api/account/passkey", "POST", { step: "add", response, label });
      setMsg({ kind: "ok", text: "Passkey saved. Next time, sign in with it instead of your password." });
      await refresh();
    } catch (err) {
      if (!cancelled(err)) setMsg({ kind: "error", text: errText(err) });
    }
  };

  const remove = async (id: string) => {
    try {
      await call("/api/account/passkey", "POST", { step: "remove", id });
      await refresh();
    } catch (err) {
      setMsg({ kind: "error", text: errText(err) });
    }
  };

  return (
    <section className="card acct-card">
      <h2>Passkeys</h2>
      <p className="acct-hint">Sign in with your fingerprint, face or device PIN instead of a password. A passkey is also how you get back in if you forget your password.</p>
      {account.passkeys.length > 0 && (
        <ul className="acct-list">
          {account.passkeys.map((k) => (
            <li key={k.id}>
              <span>
                {k.label}
                <small>Added {k.created.slice(0, 10)}</small>
              </span>
              <button type="button" className="inline-link" onClick={() => remove(k.id)} aria-label={`Remove passkey ${k.label}`}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      {supported ? (
        <button type="button" className="btn" onClick={add}>
          Add a passkey
        </button>
      ) : (
        <p className="acct-hint">This browser can&apos;t save passkeys.</p>
      )}
      <Note msg={msg} />
    </section>
  );
}

function PasswordCard({ account }: { account: Account }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [msg, setMsg] = useState<Msg>(null);
  const needCurrent = account.hasPassword && !account.passkeySession;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    try {
      await call("/api/account/password", "POST", { current, next });
      setCurrent("");
      setNext("");
      setMsg({ kind: "ok", text: "Password changed. Other browsers signed in with the old one are signed out." });
    } catch (err) {
      setMsg({ kind: "error", text: errText(err) });
    }
  };

  return (
    <section className="card acct-card">
      <h2>{account.hasPassword ? "Change password" : "Set a password"}</h2>
      <form className="acct-form" method="post" action="/account" onSubmit={submit}>
        <input type="text" name="username" autoComplete="username" value={account.email ?? ""} readOnly tabIndex={-1} aria-hidden="true" className="visually-hidden" />
        {needCurrent && (
          <label>
            Current password
            <input type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
          </label>
        )}
        <label>
          New password
          <input type="password" autoComplete="new-password" required minLength={10} value={next} onChange={(e) => setNext(e.target.value)} />
        </label>
        <button type="submit" className="btn">
          Save password
        </button>
      </form>
      <Note msg={msg} />
    </section>
  );
}

function OwnerCard({ account, refresh }: { account: Account; refresh: () => Promise<void> }) {
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<Msg>(null);

  const claim = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    try {
      await call("/api/account/owner", "POST", { password });
      await refresh();
    } catch (err) {
      setMsg({ kind: "error", text: errText(err) });
    }
  };

  if (account.owner) {
    return (
      <section className="card acct-card">
        <h2>Site owner</h2>
        <p className="acct-hint">Only this account opens these.</p>
        <p className="acct-links">
          <Link className="btn" href="/account/simulator">
            3D Simulator
          </Link>
          <Link className="btn ghost" href="/account/edit">
            Edit site text
          </Link>
        </p>
      </section>
    );
  }
  return (
    <section className="card acct-card">
      <details>
        <summary>Site owner</summary>
        <form className="acct-form" method="post" action="/account" onSubmit={claim}>
          <p className="acct-hint">Run this site? Enter the site password once to make this account its owner.</p>
          <label>
            Site password
            <input type="password" autoComplete="off" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <button type="submit" className="btn">
            Make this account the owner
          </button>
        </form>
        <Note msg={msg} />
      </details>
    </section>
  );
}

function DeleteCard({ account, refresh }: { account: Account; refresh: () => Promise<void> }) {
  const [password, setPassword] = useState("");
  const [sure, setSure] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const needPassword = account.hasPassword && !account.passkeySession;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    try {
      await call("/api/account", "DELETE", { password });
      forgetAccount();
      await refresh();
    } catch (err) {
      setMsg({ kind: "error", text: errText(err) });
    }
  };

  return (
    <section className="card acct-card acct-danger">
      <details>
        <summary>Delete account</summary>
        <form className="acct-form" method="post" action="/account" onSubmit={submit}>
          <p className="acct-hint">
            This deletes your account, passkeys and synced Favorites and settings. This browser keeps its own copy. A player page you published from My Stats stays until you remove it
            there.
          </p>
          {needPassword && (
            <label>
              Password
              <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
          )}
          <label className="acct-check">
            <input type="checkbox" checked={sure} onChange={(e) => setSure(e.target.checked)} /> I want to delete my account
          </label>
          <button type="submit" className="btn danger" disabled={!sure}>
            Delete account
          </button>
        </form>
        <Note msg={msg} />
      </details>
    </section>
  );
}
