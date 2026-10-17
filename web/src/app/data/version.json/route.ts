// This deploy's version: the moment it was built. UpdateToast compares it over time to spot a new deploy.
export const dynamic = "force-static";

const BUILT = new Date().toISOString();

export function GET() {
  return Response.json({ built: BUILT });
}
