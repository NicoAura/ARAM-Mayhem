import { NextResponse } from "next/server";
import { bindingNames, serverEnv } from "@/lib/env";

// GET /api/admin/status: which server secrets the running site can see (yes/no only, never values).
export const dynamic = "force-dynamic";

export function GET() {
  const has = (k: string) => Boolean(serverEnv(k));
  return NextResponse.json({
    ADMIN_PASSWORD: has("ADMIN_PASSWORD"),
    GITHUB_TOKEN: has("GITHUB_TOKEN"),
    RIOT_API_KEY: has("RIOT_API_KEY"),
    bindings: bindingNames(),
  });
}
