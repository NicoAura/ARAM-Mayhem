import "server-only";
import { serverEnv } from "./env";

// Sign in with Google and Sign in with Apple (OpenID Connect). Each one switches on when its secrets are
// set on the Worker; until then its buttons don't show. Redirect URIs to register with each provider:
//   https://deeparam.com/api/account/oauth/google/callback
//   https://deeparam.com/api/account/oauth/apple/callback   (Apple: also add deeparam.com as a domain)
// Google: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET (an OAuth client of type "Web application").
// Apple: APPLE_CLIENT_ID (the Services ID), APPLE_TEAM_ID, APPLE_KEY_ID and APPLE_PRIVATE_KEY (the .p8
// key's text). Apple has no fixed client secret: each sign-in signs a short-lived one with that key.

export const PROVIDERS = ["google", "apple"] as const;
export type Provider = (typeof PROVIDERS)[number];
export const PROVIDER_NAMES: Record<Provider, string> = { google: "Google", apple: "Apple" };

type Config = { authorize: string; token: string; issuer: string; scope: string; clientId: () => string | undefined; secrets: string[] };
const CONFIG: Record<Provider, Config> = {
  google: {
    authorize: "https://accounts.google.com/o/oauth2/v2/auth",
    token: "https://oauth2.googleapis.com/token",
    issuer: "https://accounts.google.com",
    scope: "openid email",
    clientId: () => serverEnv("GOOGLE_CLIENT_ID"),
    secrets: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
  },
  apple: {
    authorize: "https://appleid.apple.com/auth/authorize",
    token: "https://appleid.apple.com/auth/token",
    issuer: "https://appleid.apple.com",
    scope: "email",
    clientId: () => serverEnv("APPLE_CLIENT_ID"),
    secrets: ["APPLE_CLIENT_ID", "APPLE_TEAM_ID", "APPLE_KEY_ID", "APPLE_PRIVATE_KEY"],
  },
};

export const isProvider = (p: unknown): p is Provider => typeof p === "string" && (PROVIDERS as readonly string[]).includes(p);
export const providerEnabled = (p: Provider) => CONFIG[p].secrets.every((s) => serverEnv(s));
export const enabledProviders = () => PROVIDERS.filter(providerEnabled);

export const redirectUri = (origin: string, p: Provider) => `${origin}/api/account/oauth/${p}/callback`;

export function authorizeUrl(p: Provider, origin: string, state: string, nonce: string): string {
  const c = CONFIG[p];
  const q = new URLSearchParams({ client_id: c.clientId() ?? "", redirect_uri: redirectUri(origin, p), response_type: "code", scope: c.scope, state, nonce });
  // Apple sends the answer back as a form POST whenever an email is asked for.
  if (p === "apple") q.set("response_mode", "form_post");
  if (p === "google") q.set("prompt", "select_account");
  return `${c.authorize}?${q}`;
}

export class OAuthError extends Error {}

const b64url = (bytes: Uint8Array | string) =>
  btoa(typeof bytes === "string" ? bytes : String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64url = (s: string) => atob(s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "="));

/** Apple's client secret: an ES256 JWT signed with the .p8 key, good for five minutes. */
async function appleSecret(): Promise<string> {
  const pem = (serverEnv("APPLE_PRIVATE_KEY") ?? "").replace(/\\n/g, "\n").replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const key = await crypto.subtle.importKey("pkcs8", Uint8Array.from(atob(pem), (c) => c.charCodeAt(0)), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: "ES256", kid: serverEnv("APPLE_KEY_ID") }));
  const body = b64url(JSON.stringify({ iss: serverEnv("APPLE_TEAM_ID"), iat: now, exp: now + 300, aud: "https://appleid.apple.com", sub: serverEnv("APPLE_CLIENT_ID") }));
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(`${head}.${body}`)));
  return `${head}.${body}.${b64url(sig)}`;
}

export type Identity = { subject: string; email: string | null };

/** Trades the one-time code for an id token and reads who signed in. */
export async function exchange(p: Provider, origin: string, code: string, nonce: string): Promise<Identity> {
  const c = CONFIG[p];
  const clientId = c.clientId() ?? "";
  const secret = p === "apple" ? await appleSecret() : (serverEnv("GOOGLE_CLIENT_SECRET") ?? "");
  const res = await fetch(c.token, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri(origin, p), client_id: clientId, client_secret: secret }),
  });
  if (!res.ok) throw new OAuthError(`${p} token ${res.status}`);
  const { id_token } = (await res.json()) as { id_token?: string };
  return readIdToken(p, id_token, clientId, nonce);
}

/**
 * The id token's claims. It came straight from the provider's token endpoint over TLS in exchange for a
 * code and our client secret, which OpenID Connect accepts in place of checking its signature; the issuer,
 * audience, expiry and nonce are still checked.
 */
export function readIdToken(p: Provider, idToken: string | undefined, clientId: string, nonce: string): Identity {
  let claims: Record<string, unknown>;
  try {
    claims = JSON.parse(unb64url((idToken ?? "").split(".")[1] ?? ""));
  } catch {
    throw new OAuthError(`${p} id token unreadable`);
  }
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  const iss = String(claims.iss ?? "").replace(/^(?!https:\/\/)/, "https://");
  if (iss !== CONFIG[p].issuer || !aud.includes(clientId) || Number(claims.exp) * 1000 < Date.now() || claims.nonce !== nonce || typeof claims.sub !== "string" || !claims.sub) {
    throw new OAuthError(`${p} id token rejected`);
  }
  const verified = claims.email_verified === true || claims.email_verified === "true";
  return { subject: claims.sub, email: typeof claims.email === "string" && verified ? claims.email.toLowerCase() : null };
}
