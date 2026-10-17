import { searchItems } from "@/lib/highlights";

// The header search's list of pages, champions and augments, loaded when search first opens. Built once per deploy.
export const dynamic = "force-static";

export function GET() {
  return Response.json(searchItems());
}
