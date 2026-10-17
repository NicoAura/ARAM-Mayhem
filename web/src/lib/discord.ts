// The Discord bot's /deeparam command: checking that a request really comes from Discord,
// matching what someone typed to a champion, and the reply card. No server-only imports,
// so the route and the tests can both use it.

export type BotChampion = {
  name: string;
  tier: string;
  rank: number;
  winRate: number;
  pickRate: number;
  augments: string[];
  core: string[];
  coreWinRate: number | null;
  boots: string | null;
  full: string[];
  skills: string[];
};

export type BotData = { patch: string | null; of: number; champions: Record<string, BotChampion> };

export const SITE = "https://deeparam.com";
const NOTICE = "DeepARAM isn't endorsed by Riot Games.";

// Discord's interaction and response types (discord.com/developers/docs/interactions/receiving-and-responding).
export const PING = 1;
export const COMMAND = 2;
export const AUTOCOMPLETE = 4;
const PONG = 1;
const MESSAGE = 4;
const CHOICES = 8;
const EPHEMERAL = 64;

const hex = (s: string) => {
  if (!/^(?:[0-9a-f]{2})+$/i.test(s)) return null;
  return Uint8Array.from(s.match(/../g)!.map((b) => parseInt(b, 16)));
};

/** True when the Ed25519 signature Discord sends matches timestamp + body under the app's public key. */
export async function verifyDiscord(body: string, signature: string | null, timestamp: string | null, publicKey: string) {
  const sig = signature ? hex(signature) : null;
  const key = hex(publicKey);
  if (!sig || !key || !timestamp) return false;
  try {
    const k = await crypto.subtle.importKey("raw", key, { name: "Ed25519" }, false, ["verify"]);
    return await crypto.subtle.verify("Ed25519", k, sig, new TextEncoder().encode(timestamp + body));
  } catch {
    return false;
  }
}

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[^a-z0-9]/g, "");

// Common short names people type for champions.
const NICKNAMES: Record<string, string> = {
  mf: "MissFortune", tf: "TwistedFate", ww: "Warwick", j4: "JarvanIV", jarvan: "JarvanIV", asol: "AurelionSol",
  kog: "KogMaw", reksai: "RekSai", lb: "Leblanc", noc: "Nocturne", mundo: "DrMundo", yi: "MasterYi", xin: "XinZhao",
  cass: "Cassiopeia", heimer: "Heimerdinger", fiddle: "FiddleSticks", naut: "Nautilus",
};

/** Champions whose name or id matches what was typed: exact first, then starts-with, then contains. */
export function findChampions(data: BotData, query: string, limit = 25): string[] {
  const q = norm(query);
  const ids = Object.keys(data.champions).sort((a, b) => data.champions[a].name.localeCompare(data.champions[b].name));
  if (!q) return ids.slice(0, limit);
  const nick = NICKNAMES[q];
  const keys = (id: string) => [norm(id), norm(data.champions[id].name)];
  const exact = ids.filter((id) => id === nick || keys(id).includes(q));
  const starts = ids.filter((id) => !exact.includes(id) && keys(id).some((k) => k.startsWith(q)));
  const has = ids.filter((id) => !exact.includes(id) && !starts.includes(id) && keys(id).some((k) => k.includes(q)));
  return [...exact, ...starts, ...has].slice(0, limit);
}

const pct = (v: number | null, digits = 1) => (v === null ? "–" : `${(v * 100).toFixed(digits)}%`);
const TIER_COLOR: Record<string, number> = { S: 0xf5b942, A: 0x8b5cf6, B: 0x3b82f6, C: 0x22c55e, D: 0x9ca3af };

/** The reply card for one champion. */
export function championEmbed(data: BotData, id: string) {
  const c = data.champions[id];
  const build = [...c.core];
  if (c.boots && !build.includes(c.boots)) build.push(c.boots);
  const fields = [
    { name: "Tier", value: `**${c.tier}** · #${c.rank} of ${data.of}`, inline: true },
    { name: "Win rate", value: pct(c.winRate), inline: true },
    { name: "Pick rate", value: pct(c.pickRate, 2), inline: true },
  ];
  if (build.length)
    fields.push({ name: `Best build${c.coreWinRate === null ? "" : ` (${pct(c.coreWinRate)} win)`}`, value: build.join(" → "), inline: false });
  if (c.full.length) fields.push({ name: "Full build", value: c.full.join(", "), inline: false });
  if (c.augments.length) fields.push({ name: "Top augments", value: c.augments.join(", "), inline: false });
  if (c.skills.length) fields.push({ name: "Skill order", value: c.skills.join(" > "), inline: true });
  return {
    title: `${c.name} · ${c.tier} tier`,
    url: `${SITE}/champions/${id}`,
    color: TIER_COLOR[c.tier] ?? 0x8b5cf6,
    thumbnail: { url: `${SITE}/icons/champions/${id}.webp` },
    fields,
    footer: { text: `${data.patch ? `ARAM Mayhem · Patch ${data.patch} · ` : ""}${NOTICE}` },
  };
}

type Option = { name: string; value?: string | number; focused?: boolean };
export type Interaction = { type: number; data?: { name?: string; options?: Option[] } };

/** Discord's response to one interaction. */
export function respond(data: BotData, interaction: Interaction) {
  if (interaction.type === PING) return { type: PONG };
  const query = String(interaction.data?.options?.find((o) => o.name === "champion")?.value ?? "");
  if (interaction.type === AUTOCOMPLETE)
    return { type: CHOICES, data: { choices: findChampions(data, query).map((id) => ({ name: data.champions[id].name, value: id })) } };
  if (interaction.type === COMMAND) {
    const id = findChampions(data, query, 1)[0];
    if (!id) return { type: MESSAGE, data: { content: `No champion matches "${query.slice(0, 50)}". Try /deeparam Jinx.`, flags: EPHEMERAL } };
    return { type: MESSAGE, data: { embeds: [championEmbed(data, id)] } };
  }
  return null;
}
