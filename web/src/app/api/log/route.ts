import { NextRequest } from "next/server";

// POST /api/log: a browser error from lib/report.ts, written to the server logs with a "client-error" tag.
// Fields are cut short and the body is capped, so nothing large or unexpected gets stored.
const FIELDS = ["message", "source", "line", "col", "stack", "page", "ua"] as const;
const MAX_BODY = 8_000;

export async function POST(req: NextRequest) {
  const text = await req.text();
  if (text.length > MAX_BODY) return new Response(null, { status: 413 });
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text);
  } catch {
    return new Response(null, { status: 400 });
  }
  if (!data || typeof data !== "object" || typeof data.message !== "string") return new Response(null, { status: 400 });
  const entry = Object.fromEntries(FIELDS.filter((k) => data[k] !== undefined).map((k) => [k, String(data[k]).slice(0, k === "stack" ? 2000 : 300)]));
  console.error("client-error", JSON.stringify(entry));
  return new Response(null, { status: 204 });
}
