import type { Metadata } from "next";
import { pageMeta } from "@/lib/meta";
import DataTable, { type Row } from "@/components/DataTable";
import Embed from "@/components/Embed";
import Intro from "@/components/Intro";
import { text } from "@/lib/content";
import Pending from "@/components/Pending";
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
      content: <Embed src="/embed/simulator/index.html" title="Mayhem fight replay" minHeight={900} />,
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

  return (
    <>
      <Intro eyebrow="Simulator" title={text("page./simulator.title", "Teamfight damage, simulated.")}>
        <span className="tag">Beta</span>{" "}
        An experiment: results can shift as the model changes. Monte Carlo teamfights against enemy teams weighted by
        Mayhem pick rates, with a build search for every champion. Use it to compare builds for one champion, not to
        rank champions.
      </Intro>
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
