import { OWNER_FLAG } from "@/lib/account-cookies";
import { body, handle, isSecure, json } from "@/lib/account-route";
import { AccountError, claimOwner, requireAccount } from "@/lib/accounts";
import { AdminError, checkPassword } from "@/lib/admin";

// POST /api/account/owner {password} → makes the signed-in account the site owner (the 3D Simulator and
// the site editor). It works once, with the editor password, while no account is the owner.
export const dynamic = "force-dynamic";

export const POST = handle(async (req) => {
  const a = await requireAccount();
  const { password } = await body(req);
  try {
    await checkPassword(typeof password === "string" ? password : null);
  } catch (err) {
    throw err instanceof AdminError ? new AccountError(err.status === 401 ? "That isn't the site password." : "Claiming isn't available.", err.status) : err;
  }
  await claimOwner(a.id);
  const res = json({ owner: true });
  res.cookies.set(OWNER_FLAG, "1", { path: "/", maxAge: 90 * 86_400, sameSite: "lax", secure: isSecure(req) });
  return res;
});
