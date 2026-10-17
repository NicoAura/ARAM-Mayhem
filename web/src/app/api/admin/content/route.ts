import { NextRequest, NextResponse } from "next/server";
import { AdminError, checkPassword, loadContent, saveContent } from "@/lib/admin";
import { ADMIN_COOKIE, ADMIN_FLAG, ADMIN_MAX_AGE, adminToken } from "@/lib/admin-session";

// GET  /api/admin/content  → { content, sha }   (header X-Admin-Password)
// POST /api/admin/content  { content, sha } → { sha }
export const dynamic = "force-dynamic";

function fail(err: unknown) {
  const status = err instanceof AdminError ? err.status : 500;
  const message = err instanceof AdminError ? err.message : "Unexpected error";
  return NextResponse.json({ error: message }, { status });
}

export async function GET(req: NextRequest) {
  try {
    await checkPassword(req.headers.get("x-admin-password"));
    const res = NextResponse.json(await loadContent());
    // Unlocking the editor also signs this browser in as admin (admin-only pages and files).
    const token = await adminToken();
    if (token) {
      const opts = { path: "/", maxAge: ADMIN_MAX_AGE, sameSite: "lax" as const, secure: req.nextUrl.protocol === "https:" };
      res.cookies.set(ADMIN_COOKIE, token, { ...opts, httpOnly: true });
      res.cookies.set(ADMIN_FLAG, "1", opts);
    }
    return res;
  } catch (err) {
    return fail(err);
  }
}

// DELETE /api/admin/content signs this browser out.
export function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(ADMIN_COOKIE);
  res.cookies.delete(ADMIN_FLAG);
  return res;
}

export async function POST(req: NextRequest) {
  try {
    await checkPassword(req.headers.get("x-admin-password"));
    const { content, sha } = (await req.json()) as { content?: unknown; sha?: string | null };
    return NextResponse.json({ sha: await saveContent(content, sha ?? null) });
  } catch (err) {
    return fail(err);
  }
}
