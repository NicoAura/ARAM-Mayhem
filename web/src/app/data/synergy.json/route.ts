import { synergyData } from "@/lib/synergy";

// The Team Builder's pair win rates, loaded when the page opens. Built once per deploy.
export const dynamic = "force-static";

export function GET() {
  return Response.json(synergyData());
}
