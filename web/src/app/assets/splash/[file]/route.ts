// Skin splash art, at /assets/splash/<Champion>_<skin number>.jpg, for the My Stats banner. There are
// thousands, so instead of a copy of each in public/assets/ the site fetches the official one and caches it.
// Default skins (number 0) are already in public/assets/dd/img/champion/splash/.

const SOURCE = "https://ddragon.leagueoflegends.com/cdn/img/champion/splash/";
const WEEK = 7 * 24 * 60 * 60;

export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const m = /^([A-Za-z]{2,30})_(\d{1,3})\.jpg$/.exec(file);
  if (!m) return new Response("Not found", { status: 404 });
  const res = await fetch(`${SOURCE}${m[1]}_${m[2]}.jpg`, { cf: { cacheTtl: WEEK, cacheEverything: true } } as RequestInit);
  if (!res.ok) return new Response("Not found", { status: 404 });
  return new Response(res.body, {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": `public, max-age=${WEEK}, immutable` },
  });
}
