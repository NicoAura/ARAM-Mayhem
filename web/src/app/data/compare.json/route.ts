import { compareData } from "@/lib/compare";

// The champion compare page's data, built once per deploy.
export const dynamic = "force-static";

export function GET() {
  return Response.json(compareData());
}
