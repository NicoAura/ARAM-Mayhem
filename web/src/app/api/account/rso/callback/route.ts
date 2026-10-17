import { NextRequest, NextResponse } from "next/server";
import { RSO_COOKIE } from "@/lib/account-cookies";
import { isSecure } from "@/lib/account-route";
import { AccountError, connectRiot, currentAccount, riotSignIn, startSession } from "@/lib/accounts";
import { rsoAccount, rsoEnabled } from "@/lib/rso";

// GET /api/account/rso/callback?code&state → Riot sends the browser back here after Sign in with Riot.
// "connect" adds the Riot account to the signed-in site account; "signin" signs in to the site account
// it's connected to, or creates one for it. Either way the browser lands on /account.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const back = new URL("/account", req.nextUrl.origin);
  const done = (error?: string) => {
    if (error) back.searchParams.set("riot-error", error);
    else back.searchParams.set("riot", "connected");
    const res = NextResponse.redirect(back, 303);
    res.headers.set("Cache-Control", "no-store");
    res.cookies.set(RSO_COOKIE, "", { path: "/api/account/rso", maxAge: 0 });
    return res;
  };
  if (!rsoEnabled()) return done("Sign in with Riot isn't available yet.");
  const q = req.nextUrl.searchParams;
  const [state, mode] = (req.cookies.get(RSO_COOKIE)?.value ?? "").split(".");
  const code = q.get("code");
  if (q.get("error")) return done("Riot sign-in was cancelled.");
  if (!state || !code || q.get("state") !== state) return done("That sign-in link expired. Try again.");
  try {
    const riot = await rsoAccount(req.nextUrl.origin, code);
    const signedIn = await currentAccount();
    if (mode === "connect" && signedIn) {
      await connectRiot(signedIn.id, riot, riot.platform);
      return done();
    }
    const account = await riotSignIn(riot, riot.platform);
    const res = done();
    await startSession(res, account, "riot", isSecure(req));
    return res;
  } catch (err) {
    if (err instanceof AccountError) return done(err.message);
    console.error("riot sign-in failed", err);
    return done("Riot sign-in didn't work. Try again.");
  }
}
