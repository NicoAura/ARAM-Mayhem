// Every image, sound and model the site shows is a copy in public/assets/ (scripts/fetch_assets.py).
// localAsset turns an outside URL found in the data (an augment icon, a splash) into that copy's path.

// The client-file copies are stored lower case, as CommunityDragon serves them.
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
    return lower ? local.toLowerCase() : local;
  }
  return url;
}
