import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextRequest } from "next/server";
import { serverEnv } from "@/lib/env";
import { respond, verifyDiscord, type BotData } from "@/lib/discord";

// POST /api/discord: the Discord bot's Interactions Endpoint URL. Discord signs every request with the app's key
// (DISCORD_PUBLIC_KEY, a Worker variable) and drops the endpoint if unsigned ones get through, so those are refused.
// Answers come from /data/bot.json, fetched through the Worker's own binding (wrangler.jsonc) and kept per instance.
export const dynamic = "force-dynamic";

const MAX_BODY = 16_000;
const KEEP = 10 * 60_000;
let cached: { data: BotData; at: number } | null = null;

type Fetcher = { fetch(req: Request): Promise<Response> };

async function botData(origin: string): Promise<BotData> {
  if (cached && Date.now() - cached.at < KEEP) return cached.data;
  const req = new Request(`${origin}/data/bot.json`);
  let self: Fetcher | undefined;
  try {
    self = (getCloudflareContext().env as unknown as Record<string, Fetcher | undefined>).WORKER_SELF_REFERENCE;
  } catch {
    // Not running on Cloudflare (next dev / next start): fetch it over the network.
  }
  const res = await (self ? self.fetch(req) : fetch(req));
  if (!res.ok) throw new Error(`bot.json ${res.status}`);
  cached = { data: (await res.json()) as BotData, at: Date.now() };
  return cached.data;
}

export async function POST(req: NextRequest) {
  const key = serverEnv("DISCORD_PUBLIC_KEY");
  if (!key) return new Response("Discord bot isn't set up", { status: 503 });
  const body = await req.text();
  if (body.length > MAX_BODY) return new Response(null, { status: 413 });
  const ok = await verifyDiscord(body, req.headers.get("x-signature-ed25519"), req.headers.get("x-signature-timestamp"), key);
  if (!ok) return new Response("Bad signature", { status: 401 });
  let interaction;
  try {
    interaction = JSON.parse(body);
  } catch {
    return new Response(null, { status: 400 });
  }
  if (interaction?.type === 1) return Response.json({ type: 1 });
  let data: BotData;
  try {
    data = await botData(req.nextUrl.origin);
  } catch (e) {
    console.error("discord-bot", String(e));
    // Discord shows "This interaction failed" on an error status, so say something plainer instead.
    if (interaction?.type === 4) return Response.json({ type: 8, data: { choices: [] } });
    return Response.json({ type: 4, data: { content: "DeepARAM couldn't load its tier list just now. Try again in a minute.", flags: 64 } });
  }
  const answer = respond(data, interaction);
  return answer ? Response.json(answer) : new Response(null, { status: 400 });
}
