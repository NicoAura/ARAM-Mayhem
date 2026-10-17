import { builderData } from "@/lib/builder";

// The Build Editor's item icons, costs and stats, loaded when the page opens. Built once per deploy.
export const dynamic = "force-static";

export function GET() {
  return Response.json(builderData());
}
