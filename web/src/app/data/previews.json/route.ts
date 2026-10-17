import { previews } from "@/lib/previews";

// Hover preview cards for champion, augment and item links, loaded on the first hover. Built once per deploy.
export const dynamic = "force-static";

export function GET() {
  return Response.json(previews());
}
