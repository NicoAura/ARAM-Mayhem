import type { Metadata } from "next";
import Link from "next/link";
import { pageMeta } from "@/lib/meta";
import DataTable, { type Row } from "@/components/DataTable";
import Embed from "@/components/Embed";
import Intro from "@/components/Intro";
import { text } from "@/lib/content";
import Pending from "@/components/Pending";
import SimLeaderboard from "@/components/SimLeaderboard";
import SimReplayEmbed, { SimViewSwitch } from "@/components/SimReplayEmbed";
import SubTabs from "@/components/SubTabs";
import { readRepoJson, repoHas } from "@/lib/repo-data";

export const metadata: Metadata = pageMeta("/simulator", "Simulator", "Simulated ARAM Mayhem teamfights, simulated builds and fight replays for every champion.");

type Named = Record<string, { name: string }>;
type BestBuilds = {
  champions: {
    champion: string;
    name: string;
    role: string;
    parse_quality: string;
    build: { items: string[]; augments: string[] };
    summary: { mean_dps: number; median: number; survival_rate: number; time_alive: number };
  }[];
};

type FightLength = {
  short_seconds: number;
  long_seconds: number;
  champions: { champion: string; name: string; role: string; dps_short: number; dps_long: number; edge: number }[];
};

const VIEWER = "simulator/viewer";

export default function SimulatorPage() {
  if (!repoHas(`${VIEWER}/index.html`) && !repoHas("simulator/README.md")) {
    return (
      <>
        <Intro eyebrow="Simulator" title={text("page./simulator.title", "Teamfight damage, simulated.")} />
        <Pending pr={4}>The simulator appears here once it is merged:</Pending>
      </>
    );
  }

  const best = readRepoJson<BestBuilds>(`${VIEWER}/replay-data/best-builds.json`);
  const items = readRepoJson<{ items: Named }>("simulator/data/items.json")?.items ?? {};
  const augments = readRepoJson<{ augments: Named }>("simulator/data/augments.json")?.augments ?? {};
  const hasReplays = repoHas(`${VIEWER}/replay-data/index.json`);

  const tabs = [];
  if (hasReplays) {
    tabs.push({
      id: "replays",
      label: "Fight replays",
      content: <SimReplayEmbed />,
    });
  }
  if (repoHas(`${VIEWER}/team.html`)) {
    tabs.push({
      id: "teamfight",
      label: "5v5 teamfight",
      lazy: true,
      content: <Embed src="/embed/simulator/team.html" title="Mayhem 5v5 teamfight" minHeight={1100} />,
    });
  }
  if (best) {
    const rows: Row[] = best.champions.map((c) => ({
      name: c.champion,
      role: c.role,
      dps: c.summary.mean_dps,
      survival: c.summary.survival_rate,
      alive: c.summary.time_alive,
      items: c.build.items.map((i) => items[i]?.name ?? i).join(", "),
      augments: c.build.augments.map((a) => augments[a]?.name ?? a).join(", "),
    }));
    tabs.push({
      id: "builds",
      label: "Simulated builds",
      content: (
        <DataTable
          columns={[
            { key: "name", label: "Champion", format: "champion" },
            { key: "role", label: "Role", format: "text" },
            { key: "dps", label: "Mean DPS", format: "int" },
            { key: "survival", label: "Survives", format: "pct" },
            { key: "items", label: "Items", format: "text", sortable: false },
            { key: "augments", label: "Augments", format: "text", sortable: false },
          ]}
          rows={rows}
          initialSort={{ key: "dps", desc: true }}
          searchKey="name"
          searchLabel="Find a champion"
        />
      ),
    });
  }

  const fights = readRepoJson<FightLength>(`${VIEWER}/replay-data/fight-length.json`);
  if (fights) {
    tabs.push({
      id: "fight-length",
      label: "Short vs long fights",
      content: (
        <>
          <p className="table-note">
            Simulated: each champion&apos;s damage per second over the first {fights.short_seconds} seconds of a fight
            and over the first {fights.long_seconds}, with its simulated best build. Going down early counts against
            both. Long-fight edge compares how much of its damage rate a champion keeps in long fights with the
            typical champion: positive means it does better the longer the fight goes, negative means it wants
            fights short.
          </p>
          <DataTable
            columns={[
              { key: "name", label: "Champion", format: "champion" },
              { key: "role", label: "Role", format: "text" },
              { key: "short", label: `First ${fights.short_seconds}s DPS`, format: "int" },
              { key: "long", label: `First ${fights.long_seconds}s DPS`, format: "int" },
              { key: "edge", label: "Long-fight edge", format: "pct" },
            ]}
            rows={fights.champions.map((c) => ({
              name: c.champion,
              role: c.role,
              short: c.dps_short,
              long: c.dps_long,
              edge: c.edge,
            }))}
            initialSort={{ key: "edge", desc: true }}
            searchKey="name"
            searchLabel="Find a champion"
          />
        </>
      ),
    });
  }

  if (hasReplays) {
    const names = (m: Named) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v.name]));
    // Leaderboards, one tab each; more boards can be added here with their own name.
    tabs.push({
      id: "leaderboard",
      label: "Leaderboard",
      lazy: true,
      content: <SimLeaderboard board="Leaderboard" items={names(items)} augments={names(augments)} />,
    });
  }

  // Infinite Ryze (The Lab's calculator) lives with the other simulations; its own page is /simulator/infinite-ryze.
  if (repoHas("tools/fun/ryze-calculator/index.html")) {
    tabs.push({
      id: "infinite-ryze",
      label: "Infinite Ryze",
      lazy: true,
      content: (
        <>
          {repoHas("web/src/app/simulator/infinite-ryze/page.tsx") && (
            <p className="table-note">
              How far Ryze&apos;s AP to Mana loop goes. <Link href="/simulator/infinite-ryze">Open it on its own page →</Link>
            </p>
          )}
          <Embed src="/embed/fun/ryze-calculator/index.html" title="Infinite Ryze" minHeight={900} />
        </>
      ),
    });
  }

  return (
    <>
      <Intro eyebrow="Simulator" title={text("page./simulator.title", "Teamfight damage, simulated.")}>
        <span className="tag">Beta</span>{" "}
        An experiment: results can shift as the model changes. Monte Carlo teamfights against enemy teams weighted by
        Mayhem pick rates, with a build search for every champion. Use it to compare builds for one champion, not to
        rank champions.{" "}
        <Link className="inline-link" href="/simulator/infinite-ryze">
          Infinite Ryze →
        </Link>
      </Intro>
      <SimViewSwitch />
      {tabs.length ? (
        <SubTabs tabs={tabs} />
      ) : (
        <Pending pr={4}>
          The simulator is in the repo, but its results haven&apos;t been generated for the site yet. See
        </Pending>
      )}
    </>
  );
}
