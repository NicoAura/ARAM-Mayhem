import { draftData } from "@/lib/draft";

// Augment Draft practice data, loaded when the page opens. Built once per deploy.
export const dynamic = "force-static";

export function GET() {
  return Response.json(draftData());
}
