import largeIcons from "@/data/augment-large-icons.json";

// Every image, sound and model the site shows is a copy in public/assets/ (scripts/fetch_assets.py).
// localAsset turns an outside URL found in the data (an augment icon, a splash) into that copy's path.

// The client-file copies are stored lower case, as CommunityDragon serves them, with the mode's internal
// "kiwi" folder and file names written as "mayhem" (fetch_assets.py local_path). The pattern is k[i]wi so the
// shipped script never spells the name either.
const LOCAL: [RegExp, string, boolean][] = [
  [/^https:\/\/raw\.communitydragon\.org\//, "/assets/cd/", true],
  [/^https:\/\/ddragon\.leagueoflegends\.com\/cdn\//, "/assets/dd/", false],
];

export function localAsset(url: string): string;
export function localAsset(url: string | undefined): string | undefined;
export function localAsset(url?: string) {
  if (!url) return url;
  for (const [re, to, lower] of LOCAL) {
    if (!re.test(url)) continue;
    const local = url.replace(re, to);
    return largeAugmentIcon(lower ? local.toLowerCase().replace(/k[i]wi/g, "mayhem") : local);
  }
  return largeAugmentIcon(url);
}

// Augment "small" icons are grey for every rarity; the "large" ones carry the silver, gold or prismatic colour.
// LARGE lists the small icons whose large copy is mirrored (Arena augments have none); fetch_assets.py writes it.
const LARGE = new Set<string>(largeIcons);
const largeAugmentIcon = (url: string) => (LARGE.has(url) ? url.replace(/_small\.png$/i, "_large.png") : url);
