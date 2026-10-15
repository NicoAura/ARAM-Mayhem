export type SectionKey = "stats" | "simulator" | "pbe";

export const sections: {
  key: SectionKey;
  href: string;
  label: string;
  title: string;
  body: string;
}[] = [
  {
    key: "stats",
    href: "/stats",
    label: "Stats",
    title: "Mayhem Stats",
    body: "Win rates, augments and builds from ARAM Mayhem matches.",
  },
  {
    key: "simulator",
    href: "/simulator",
    label: "Simulator",
    title: "Damage Simulator",
    body: "Pick a champion, items and augments to estimate damage against a target.",
  },
  {
    key: "pbe",
    href: "/pbe",
    label: "PBE",
    title: "PBE Changes",
    body: "Mayhem changes currently on the test server, before they go live.",
  },
];
