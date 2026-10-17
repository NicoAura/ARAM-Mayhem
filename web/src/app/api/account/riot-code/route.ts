import { handle, json } from "@/lib/account-route";
import { newLinkCode, requireAccount, unlinkRiot } from "@/lib/accounts";

// POST   /api/account/riot-code → a one-time code to connect a Riot account through My Stats
// DELETE /api/account/riot-code → disconnects the Riot account
export const dynamic = "force-dynamic";

export const POST = handle(async () => {
  const a = await requireAccount();
  return json({ code: await newLinkCode(a.id) });
});

export const DELETE = handle(async () => {
  const a = await requireAccount();
  await unlinkRiot(a.id);
  return json({ ok: true });
});
