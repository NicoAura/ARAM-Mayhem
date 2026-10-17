// What each champion archetype tag looks like and means (built by lib/champion-tags.ts), safe for the browser.

export type TagKind = "class" | "sub" | "play";
export type TagInfo = Record<string, { color: string; meaning: string; kind: TagKind }>;

/** The tags in a set, grouped by kind in display order. */
export function tagsByKind(info: TagInfo): Record<TagKind, string[]> {
  const out: Record<TagKind, string[]> = { class: [], sub: [], play: [] };
  for (const [name, t] of Object.entries(info)) out[t.kind].push(name);
  return out;
}
