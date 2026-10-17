import { getCloudflareContext } from "@opennextjs/cloudflare";

// Admin sign-in that lasts: unlocking /admin with the password sets ADMIN_COOKIE (HttpOnly), a signature
// made with ADMIN_PASSWORD, so changing the password signs every admin out. Server pages and routes call
// isAdmin(); middleware uses adminFromCookie() to keep admin-only files (3D models, ability videos)
// private. ADMIN_FLAG is a readable twin that only tells the browser to try loading them.

export const ADMIN_COOKIE = "deeparam-admin";
export const ADMIN_FLAG = "deeparam-admin-ui";
export const ADMIN_MAX_AGE = 60 * 60 * 24 * 30;

function password(): string | undefined {
  try {
    const v = (getCloudflareContext().env as unknown as Record<string, unknown>).ADMIN_PASSWORD;
    if (typeof v === "string" && v) return v;
  } catch {
    // Not running on Cloudflare.
  }
  return process.env.ADMIN_PASSWORD || undefined;
}

async function sign(secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode("deeparam-admin-v1")));
  return [...mac].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** The cookie value for a signed-in admin, or null when no password is set. */
export async function adminToken(): Promise<string | null> {
  const pw = password();
  return pw ? sign(pw) : null;
}

/** Whether a cookie value is a valid admin signature (compared in constant time). */
export async function adminFromCookie(value: string | undefined): Promise<boolean> {
  const want = await adminToken();
  if (!want || !value || value.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ value.charCodeAt(i);
  return diff === 0;
}

/** For server components and route handlers: is this request from a signed-in admin? */
export async function isAdmin(): Promise<boolean> {
  const { cookies } = await import("next/headers");
  return adminFromCookie((await cookies()).get(ADMIN_COOKIE)?.value);
}
