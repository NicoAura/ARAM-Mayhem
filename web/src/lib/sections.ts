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
    href: "/builds",
    label: text("tab./builds.label", "Build tools"),
    body: text("tab./builds.body", "A build editor with simulated damage, champion comparisons and team synergy."),
    pr: 0,
  },
  {
    href: "/augments",
    label: text("tab./augments.label", "Augments"),
    body: text("tab./augments.body", "Augments grouped by icon, plus draft practice with rerolls."),
    pr: 0,
  },
  {
    href: "/items",
    label: text("tab./items.label", "Items"),
    body: text("tab./items.body", "Every item Mayhem players build, tagged by what it gives, with filters."),
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

