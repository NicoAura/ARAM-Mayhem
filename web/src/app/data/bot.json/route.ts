import { botData } from "@/lib/bot";

// Tiers and builds for the Discord bot (/api/discord), which reads this instead of the repo files. Built once per deploy.
export const dynamic = "force-static";

export function GET() {
  return Response.json(botData());
}
