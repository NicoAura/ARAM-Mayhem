import { text } from "./content";

// The site's tabs. Each one shows the work of one project thread; `pr` is the pull
// request that adds that thread's data to the repo.
export const sections = [
  {
    href: "/stats",
    label: text("tab./stats.label", "My Stats"),
    body: text("tab./stats.body", "Your own Mayhem games: win rate, champions, augments and recent matches."),
    pr: 2,
  },
  {
    href: "/tier-list",
    label: text("tab./tier-list.label", "Tier List"),
    body: text("tab./tier-list.body", "Champion, augment and duo win rates, patch by patch."),
    pr: 5,
  },
  {
    href: "/simulator",
    label: text("tab./simulator.label", "Simulator"),
    body: text("tab./simulator.body", "Simulated teamfights, simulated builds and fight replays for every champion."),
    pr: 4,
  },
  {
    href: "/compare",
    label: text("tab./compare.label", "Compare"),
    body: text("tab./compare.body", "Two champions side by side: win rates, builds, skill order and simulated damage."),
    pr: 0,
  },
  {
    href: "/builder",
    label: text("tab./builder.label", "Build Editor"),
    body: text("tab./builder.body", "Drag items and augments into a build to see its stats, gold and simulated damage."),
    pr: 0,
  },
  {
    href: "/what-to-build",
    label: text("tab./what-to-build.label", "Build Helper"),
    body: text("tab./what-to-build.body", "Pick your champion and what the enemy has: the build that wins most, item swaps and augments to grab."),
    pr: 0,
  },
  {
    href: "/augments",
    label: text("tab./augments.label", "Augment Tiers"),
    body: text("tab./augments.body", "Every augment ranked S to D within its rarity, filtered by rarity and build style."),
    pr: 0,
  },
  {
    href: "/draft",
    label: text("tab./draft.label", "Augment Draft"),
    body: text("tab./draft.body", "Practice augment picks with rerolls and see how often players on your champion take each one."),
    pr: 0,
  },
  {
    href: "/synergy",
    label: text("tab./synergy.label", "Team Builder"),
    body: text("tab./synergy.body", "Pick your team to see each pair's win rate together and who fits it best."),
    pr: 0,
  },
  {
    href: "/patches",
    label: text("tab./patches.label", "Patch Recaps"),
    body: text("tab./patches.body", "What every patch changed: augments added, removed and tuned, and the champions that moved most."),
    pr: 0,
  },
  {
    href: "/pbe",
    label: text("tab./pbe.label", "PBE"),
    body: text("tab./pbe.body", "Mayhem Season 3 changes from the test server."),
    pr: 1,
  },
];

