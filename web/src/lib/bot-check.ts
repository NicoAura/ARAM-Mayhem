import "server-only";
import { serverEnv } from "@/lib/env";

// An invisible "are you a person?" check on public submissions (the Simulator leaderboard).
// It's on only once both keys are Worker secrets: TURNSTILE_SITE_KEY (public, sent to the page)
// and TURNSTILE_SECRET_KEY. Until then every submission passes, so the leaderboard keeps working.
const VERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
export const BOT_CHECK_SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

function keys() {
  const site = serverEnv("TURNSTILE_SITE_KEY");
  const secret = serverEnv("TURNSTILE_SECRET_KEY");
  return site && secret ? { site, secret } : null;
}

/** The public key for the page's widget, or null while the check is off. */
export function botCheckSiteKey(): string | null {
  return keys()?.site ?? null;
}

/** True when the token from the page's widget is valid, or when the check is off. */
export async function passesBotCheck(token: unknown, ip: string | null): Promise<boolean> {
  const k = keys();
  if (!k) return true;
  if (typeof token !== "string" || !token || token.length > 2048) return false;
  const form = new FormData();
  form.append("secret", k.secret);
  form.append("response", token);
  if (ip) form.append("remoteip", ip);
  try {
    const r = await fetch(VERIFY, { method: "POST", body: form });
    const body = (await r.json()) as { success?: boolean };
    return body.success === true;
  } catch {
    return false;
  }
}
