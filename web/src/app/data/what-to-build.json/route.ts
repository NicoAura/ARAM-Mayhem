import { SWAPS, whatToBuildData } from "@/lib/what-to-build";

// "What should I build?" data, loaded when the page opens. Built once per deploy.
export const dynamic = "force-static";

export function GET() {
  return Response.json({ ...whatToBuildData(), swaps: SWAPS });
}
