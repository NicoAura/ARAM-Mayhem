import { NextRequest, NextResponse } from "next/server";
import { RSO_COOKIE } from "@/lib/account-cookies";
import { isSecure } from "@/lib/account-route";
import { authorizeUrl, rsoEnabled } from "@/lib/rso";

// GET /api/account/rso/start?mode=signin|connect → sends the browser to Riot's sign-in page. The state
// is kept in an HttpOnly cookie for ten minutes and checked when Riot sends the browser back.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const back = new URL("/account", req.nextUrl.origin);
  if (!rsoEnabled()) {
    back.searchParams.set("riot-error", "Sign in with Riot isn't available yet.");
    return NextResponse.redirect(back, 303);
  }
  const mode = req.nextUrl.searchParams.get("mode") === "connect" ? "connect" : "signin";
  const state = [...crypto.getRandomValues(new Uint8Array(24))].map((b) => b.toString(16).padStart(2, "0")).join("");
  const res = NextResponse.redirect(authorizeUrl(req.nextUrl.origin, state), 303);
  res.headers.set("Cache-Control", "no-store");
  res.cookies.set(RSO_COOKIE, `${state}.${mode}`, { path: "/api/account/rso", maxAge: 600, httpOnly: true, sameSite: "lax", secure: isSecure(req) });
  return res;
}
