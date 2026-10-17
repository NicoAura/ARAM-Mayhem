import { duoRows } from "@/lib/duos";

// The Tier List's Duos tab, loaded when the tab is opened. Built once per deploy.
export const dynamic = "force-static";

export function GET() {
  return Response.json(duoRows());
}
