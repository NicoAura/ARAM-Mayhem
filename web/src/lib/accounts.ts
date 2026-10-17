import "server-only";
import type { NextResponse } from "next/server";
import { CHALLENGE_COOKIE, OWNER_FLAG, SESSION_COOKIE, SESSION_DAYS, SIGNED_IN_FLAG } from "./account-cookies";
import { accountsDb, sessionAccount, sha256, type DB, type SessionAccount } from "./account-session";
import { profileByPuuid, profilePath } from "./profiles";
<<<<<<< HEAD
import { rsoEnabled } from "./rso";
=======
>>>>>>> origin/main
import { DEFAULT_SETTINGS } from "./settings";

// Site accounts: sign in with an email and password or a passkey, and Favorites and settings follow
// you to every browser you sign in on. Passwords are stored as salted PBKDF2 hashes, sessions as the
// SHA-256 of a random token. One account can be the site owner (the 3D Simulator and the site editor).
// A Riot account is connected through My Stats (a one-time code the helper confirms with the Riot Client).

export class AccountError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export async function db(): Promise<DB> {
  const d = await accountsDb().catch(() => null);
  if (!d) throw new AccountError("Accounts aren't available right now. Try again later.", 503);
  return d;
}

// ---- Passwords ----

const ITERATIONS = 100_000; // the most Cloudflare Workers allow for PBKDF2
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function pbkdf2(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256));
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${ITERATIONS}$${b64(salt)}$${b64(await pbkdf2(password, salt, ITERATIONS))}`;
}

export async function checkPasswordHash(password: string, stored: string | null): Promise<boolean> {
  const [kind, iter, salt, hash] = (stored ?? "").split("$");
  if (kind !== "pbkdf2" || !salt || !hash) return false;
  const got = await pbkdf2(password, unb64(salt), Number(iter));
  const want = unb64(hash);
  if (got.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got[i] ^ want[i];
  return diff === 0;
}

export function cleanEmail(raw: unknown): string {
  const email = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AccountError("Enter a valid email address.");
  return email;
}

export function cleanPassword(raw: unknown): string {
  const pw = typeof raw === "string" ? raw : "";
  if (pw.length < 10) throw new AccountError("Use at least 10 characters for your password.");
  if (pw.length > 200) throw new AccountError("That password is too long.");
  return pw;
}

// ---- Sessions ----

const randomToken = () => b64(crypto.getRandomValues(new Uint8Array(32))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** Starts a session and sets its cookies on the response. */
export async function startSession(res: NextResponse, account: { id: string; owner: boolean }, method: "password" | "passkey" | "riot", secure: boolean) {
  const d = await db();
  const token = randomToken();
  const now = Date.now();
  const expires = now + SESSION_DAYS * 86_400_000;
  await d.batch([
    d.prepare("INSERT INTO sessions (id, account, method, created, expires) VALUES (?, ?, ?, ?, ?)").bind(await sha256(token), account.id, method, now, expires),
    d.prepare("DELETE FROM sessions WHERE expires < ?").bind(now),
  ]);
  const opts = { path: "/", maxAge: SESSION_DAYS * 86_400, sameSite: "lax" as const, secure };
  res.cookies.set(SESSION_COOKIE, token, { ...opts, httpOnly: true });
  res.cookies.set(SIGNED_IN_FLAG, "1", opts);
  if (account.owner) res.cookies.set(OWNER_FLAG, "1", opts);
  else res.cookies.delete(OWNER_FLAG);
}

export function clearSessionCookies(res: NextResponse) {
  for (const c of [SESSION_COOKIE, SIGNED_IN_FLAG, OWNER_FLAG, CHALLENGE_COOKIE]) res.cookies.delete(c);
}

export async function endSession(token: string | undefined) {
  if (!token) return;
  await (await db()).prepare("DELETE FROM sessions WHERE id = ?").bind(await sha256(token)).run();
}

/** For route handlers and server pages: the signed-in account, or null. */
export async function currentAccount(): Promise<SessionAccount | null> {
  const { cookies } = await import("next/headers");
  return sessionAccount((await cookies()).get(SESSION_COOKIE)?.value);
}

export async function requireAccount(): Promise<SessionAccount> {
  const a = await currentAccount();
  if (!a) throw new AccountError("Sign in first.", 401);
  return a;
}

// ---- Accounts ----

type Row = { id: string; email: string | null; pass: string | null; owner: number; data: string; riot_puuid: string | null; riot_name: string | null; riot_platform: string | null };

export async function createAccount(email: string, password: string): Promise<{ id: string; owner: boolean }> {
  const d = await db();
  if (await d.prepare("SELECT 1 FROM accounts WHERE email = ?").bind(email).first()) throw new AccountError("There's already an account with that email. Sign in instead.", 409);
  const id = crypto.randomUUID();
  await d.prepare("INSERT INTO accounts (id, email, pass, created_at) VALUES (?, ?, ?, datetime('now'))").bind(id, email, await hashPassword(password)).run();
  return { id, owner: false };
}

export async function passwordSignIn(email: string, password: string): Promise<{ id: string; owner: boolean }> {
  const row = await (await db()).prepare("SELECT id, pass, owner FROM accounts WHERE email = ?").bind(email).first<Row>();
  // Hash even when there's no account, so the answer takes as long either way.
  const ok = await checkPasswordHash(password, row?.pass ?? "pbkdf2$100000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=");
  if (!row || !ok) throw new AccountError("Wrong email or password.", 401);
  return { id: row.id, owner: row.owner === 1 };
}

export type AccountData = { favorites: string[]; settings: Record<string, unknown> };

/** Keeps only what the site saves: champion ids, and known settings with the right types. */
export function cleanData(raw: unknown): AccountData {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const favorites = Array.isArray(r.favorites) ? r.favorites.filter((f): f is string => typeof f === "string" && /^[\w.' -]{1,40}$/.test(f)).slice(0, 300) : [];
  const settings: Record<string, unknown> = {};
  const s = (r.settings && typeof r.settings === "object" ? r.settings : {}) as Record<string, unknown>;
  for (const [k, def] of Object.entries(DEFAULT_SETTINGS)) {
    const v = s[k];
    if (typeof v === typeof def && (typeof v !== "string" || v.length <= 20)) settings[k] = v;
  }
  return { favorites: [...new Set(favorites)], settings };
}

export async function saveData(id: string, data: unknown) {
  await (await db()).prepare("UPDATE accounts SET data = ? WHERE id = ?").bind(JSON.stringify(cleanData(data)), id).run();
}

/** Everything the account page shows. */
export async function accountView(a: SessionAccount) {
  const d = await db();
  const row = await d.prepare("SELECT * FROM accounts WHERE id = ?").bind(a.id).first<Row>();
  if (!row) throw new AccountError("Sign in first.", 401);
  const keys = await d.prepare("SELECT id, label, created_at FROM passkeys WHERE account = ? ORDER BY created_at").bind(a.id).all<{ id: string; label: string | null; created_at: string }>();
  const ownerTaken = await d.prepare("SELECT 1 FROM accounts WHERE owner = 1").first();
  let data: AccountData = { favorites: [], settings: {} };
  try {
    data = cleanData(JSON.parse(row.data));
  } catch {}
  const profile = row.riot_puuid ? await profileByPuuid(row.riot_puuid).catch(() => null) : null;
  return {
    id: row.id,
    email: row.email,
    hasPassword: Boolean(row.pass),
    owner: row.owner === 1,
    // The owner can be claimed once, with the old editor password, while nobody holds it.
    canClaimOwner: !ownerTaken,
    data,
    passkeys: keys.results.map((k) => ({ id: k.id, label: k.label ?? "Passkey", created: k.created_at })),
    riot: row.riot_name ? { name: row.riot_name, platform: row.riot_platform, page: profile ? profilePath(profile.platform, profile.name, profile.tag) : null } : null,
    // A password can be replaced without the old one right after a passkey sign-in (the "forgot password" route).
    passkeySession: a.method === "passkey" && Date.now() - a.created < 15 * 60_000,
<<<<<<< HEAD
    rso: rsoEnabled(),
=======
>>>>>>> origin/main
  };
}

export async function changePassword(a: SessionAccount, current: unknown, next: string) {
  const d = await db();
  const row = await d.prepare("SELECT pass FROM accounts WHERE id = ?").bind(a.id).first<Row>();
  const fresh = a.method === "passkey" && Date.now() - a.created < 15 * 60_000;
  if (row?.pass && !fresh && !(typeof current === "string" && (await checkPasswordHash(current, row.pass)))) throw new AccountError("Your current password is wrong.", 401);
  await d.batch([
    d.prepare("UPDATE accounts SET pass = ? WHERE id = ?").bind(await hashPassword(next), a.id),
    // Other browsers signed in with the old password are signed out.
    d.prepare("DELETE FROM sessions WHERE account = ? AND method = 'password'").bind(a.id),
  ]);
}

export async function deleteAccount(id: string) {
  const d = await db();
  await d.batch(["passkeys", "sessions", "link_codes"].map((t) => d.prepare(`DELETE FROM ${t} WHERE account = ?`).bind(id)).concat(d.prepare("DELETE FROM accounts WHERE id = ?").bind(id)));
}

export async function claimOwner(id: string) {
  const d = await db();
  if (await d.prepare("SELECT 1 FROM accounts WHERE owner = 1").first()) throw new AccountError("The site already has an owner.", 409);
  await d.prepare("UPDATE accounts SET owner = 1 WHERE id = ?").bind(id).run();
}

// ---- Riot account (through My Stats) ----

/** A short code the account page shows; My Stats sends it with the Riot Client's sign-in to connect the two. */
export async function newLinkCode(id: string): Promise<string> {
  const d = await db();
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const code = [...crypto.getRandomValues(new Uint8Array(8))].map((b) => alphabet[b % alphabet.length]).join("");
  await d.batch([
    d.prepare("DELETE FROM link_codes WHERE account = ? OR expires < ?").bind(id, Date.now()),
    d.prepare("INSERT INTO link_codes (code, account, expires) VALUES (?, ?, ?)").bind(code, id, Date.now() + 15 * 60_000),
  ]);
  return code;
}

export async function linkRiot(code: unknown, riot: { puuid: string; name: string; tag: string }, platform: string) {
  const c = typeof code === "string" ? code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "") : "";
  const d = await db();
  const row = c ? await d.prepare("SELECT account FROM link_codes WHERE code = ? AND expires > ?").bind(c, Date.now()).first<{ account: string }>() : null;
  if (!row) throw new AccountError("That code has expired or isn't right. Get a new one from your account page.", 400);
<<<<<<< HEAD
  await setRiot(d, row.account, riot, platform, [d.prepare("DELETE FROM link_codes WHERE code = ?").bind(c)]);
}

function setRiot(d: DB, id: string, riot: { puuid: string; name: string; tag: string }, platform: string | null, also: ReturnType<DB["prepare"]>[] = []) {
  return d.batch([
    // A Riot account belongs to one site account at a time.
    d.prepare("UPDATE accounts SET riot_puuid = NULL, riot_name = NULL, riot_platform = NULL WHERE riot_puuid = ?").bind(riot.puuid),
    d.prepare("UPDATE accounts SET riot_puuid = ?, riot_name = ?, riot_platform = ? WHERE id = ?").bind(riot.puuid, `${riot.name}#${riot.tag}`, platform, id),
    ...also,
  ]);
}

// ---- Sign in with Riot (lib/rso.ts; off until the production key) ----

/** Connects the Riot account that just signed in with Riot to the signed-in site account. */
export async function connectRiot(id: string, riot: { puuid: string; name: string; tag: string }, platform: string | null) {
  await setRiot(await db(), id, riot, platform);
}

/** Signs in with Riot: the site account that Riot account is connected to, or a new one for it. */
export async function riotSignIn(riot: { puuid: string; name: string; tag: string }, platform: string | null): Promise<{ id: string; owner: boolean }> {
  const d = await db();
  const row = await d.prepare("SELECT id, owner FROM accounts WHERE riot_puuid = ?").bind(riot.puuid).first<{ id: string; owner: number }>();
  if (row) {
    // Keep the Riot ID and server current (they can change).
    await d.prepare("UPDATE accounts SET riot_name = ?, riot_platform = COALESCE(?, riot_platform) WHERE id = ?").bind(`${riot.name}#${riot.tag}`, platform, row.id).run();
    return { id: row.id, owner: row.owner === 1 };
  }
  const id = crypto.randomUUID();
  await d
    .prepare("INSERT INTO accounts (id, riot_puuid, riot_name, riot_platform, created_at) VALUES (?, ?, ?, ?, datetime('now'))")
    .bind(id, riot.puuid, `${riot.name}#${riot.tag}`, platform)
    .run();
  return { id, owner: false };
}

export async function unlinkRiot(id: string) {
  const d = await db();
  const row = await d.prepare("SELECT email, pass, (SELECT COUNT(*) FROM passkeys WHERE account = accounts.id) AS keys FROM accounts WHERE id = ?").bind(id).first<{ email: string | null; pass: string | null; keys: number }>();
  // An account made with Sign in with Riot has no other way in until it gets a passkey.
  if (row && !(row.email && row.pass) && !row.keys) throw new AccountError("Add a passkey first. Your Riot account is the only way into this account.", 409);
  await d.prepare("UPDATE accounts SET riot_puuid = NULL, riot_name = NULL, riot_platform = NULL WHERE id = ?").bind(id).run();
=======
  await d.batch([
    // A Riot account belongs to one site account at a time.
    d.prepare("UPDATE accounts SET riot_puuid = NULL, riot_name = NULL, riot_platform = NULL WHERE riot_puuid = ?").bind(riot.puuid),
    d.prepare("UPDATE accounts SET riot_puuid = ?, riot_name = ?, riot_platform = ? WHERE id = ?").bind(riot.puuid, `${riot.name}#${riot.tag}`, platform, row.account),
    d.prepare("DELETE FROM link_codes WHERE code = ?").bind(c),
  ]);
}

export async function unlinkRiot(id: string) {
  await (await db()).prepare("UPDATE accounts SET riot_puuid = NULL, riot_name = NULL, riot_platform = NULL WHERE id = ?").bind(id).run();
>>>>>>> origin/main
}
