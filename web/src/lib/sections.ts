// The site's tabs. Each one shows the work of one project thread; `pr` is the pull
// request that adds that thread's data to the repo.
export const sections = [
  {
    href: "/stats",
    label: "My Stats",
    body: "Your own Mayhem games: win rate, champions, augments and recent matches.",
    pr: 2,
  },
  {
    href: "/china",
    label: "China Stats",
    body: "Champion, augment and duo stats from the Chinese servers, patch by patch.",
    pr: 5,
  },
  {
    href: "/simulator",
    label: "Simulator",
    body: "Simulated teamfights, best builds and fight replays for every champion.",
    pr: 4,
  },
  {
    href: "/pbe",
    label: "PBE",
    body: "Mayhem Season 3 changes datamined from the test server.",
    pr: 1,
  },
] as const;

export const REPO_URL = "https://github.com/NicoAura/ARAM-Mayhem";
