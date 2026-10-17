// Challenge token images, at /assets/challenge/<id>-<LEVEL>.png. Like profile icons there are thousands
// (every challenge at every level), so the site fetches the official one it needs and caches it.

const SOURCE = "https://ddragon.leagueoflegends.com/cdn/img/challenges-images/";
const WEEK = 7 * 24 * 60 * 60;
const LEVELS = "IRON|BRONZE|SILVER|GOLD|PLATINUM|DIAMOND|MASTER|GRANDMASTER|CHALLENGER";

export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const m = new RegExp(`^(\\d{1,7})-(${LEVELS})\\.png$`).exec(file);
  if (!m) return new Response("Not found", { status: 404 });
  const res = await fetch(`${SOURCE}${m[1]}-${m[2]}.png`, { cf: { cacheTtl: WEEK, cacheEverything: true } } as RequestInit);
  if (!res.ok) return new Response("Not found", { status: 404 });
  return new Response(res.body, {
    headers: { "Content-Type": "image/png", "Cache-Control": `public, max-age=${WEEK}, immutable` },
  });
}
