import "server-only";
import { readRepoJson } from "./repo-data";
import type { TagInfo } from "./tag-info";

// Each champion's archetype tags: Riot's official class and subclass (Mage, Burst), then playstyle tags
// (Poke, Engage, Sustain, Shields/Heals, Crowd control), each with a colour and a one-line meaning.
// Data: champions/tags.json.

type Tags = {
  colors: Record<string, string>;
  meanings: Record<string, string>;
  classes: Record<string, string[]>;
  champions: Record<string, { roles: string[]; classes: string[]; subclasses: string[]; playstyles: string[] }>;
};

// Champions too new for a Riot class fall back to their game roles, named as the class they match.
const ROLE_CLASS: Record<string, string> = { Assassin: "Slayer", Support: "Controller" };

let cache: { tags: Record<string, string[]>; info: TagInfo } | null = null;

export function championTagData() {
  if (cache) return cache;
  const d = readRepoJson<Tags>("champions/tags.json");
  if (!d) return (cache = { tags: {}, info: {} });
  const classes = new Set(Object.keys(d.classes));
  const info: TagInfo = {};
  for (const [name, color] of Object.entries(d.colors)) {
    if (name === "Support") continue;
    const kind = classes.has(name) ? "class" : Object.values(d.classes).some((s) => s.includes(name)) ? "sub" : "play";
    info[name] = { color, meaning: d.meanings[name] ?? classMeaning(name, d.classes[name] ?? []), kind };
  }
  const tags: Record<string, string[]> = {};
  for (const [alias, c] of Object.entries(d.champions)) {
    const base = c.classes.length ? c.classes : c.roles.map((r) => ROLE_CLASS[r] ?? r);
    // A subclass named like its class (Marksman) shows once.
    tags[alias] = [...new Set([...base, ...c.subclasses, ...c.playstyles])].filter((t) => info[t]);
  }
  return (cache = { tags, info });
}

const classMeaning = (name: string, subs: string[]) =>
  subs.length > 1 || subs[0] !== name ? `Riot's ${name} class: ${subs.join(", ")}.` : `Riot's ${name} class.`;

/** Tags for one champion; seasonal skins (Jade_Ahri) share the base champion's. */
export function championTags(alias: string): string[] {
  const { tags } = championTagData();
  return tags[alias] ?? tags[alias.replace(/^Jade_/, "")] ?? [];
}

/** Every champion's tags, keyed by alias, for pages that ship them to the browser. */
export function allChampionTags(aliases: string[]): Record<string, string[]> {
  return Object.fromEntries(aliases.map((a) => [a, championTags(a)]).filter(([, t]) => t.length));
}
