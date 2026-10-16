import { NextRequest, NextResponse } from "next/server";
import { AdminError, checkPassword, loadContent, saveContent } from "@/lib/admin";

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
    return NextResponse.json(await loadContent());
  } catch (err) {
    return fail(err);
  }
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
