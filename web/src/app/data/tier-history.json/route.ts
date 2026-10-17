import { patchRows } from "@/lib/champions";

// Every patch's champion rows, for Tier List ranges beyond the live patch. Built once per deploy;
// the page itself only carries the live and previous patch, so it loads fast.
export const dynamic = "force-static";

export function GET() {
  return Response.json(patchRows());
}
