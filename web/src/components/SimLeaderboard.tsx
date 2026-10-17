"use client";

import { useEffect, useState } from "react";
import DataTable, { type Row } from "@/components/DataTable";

type Board = { builds: { champion: string; items: string[]; augments: string[]; dps: number; survival: number; patch: string }[] };

// The best build visitors have found for each champion, from /api/sim-scores. Only builds the simulator
// re-ran on our side are listed, with the damage from that run; each links to its fight replay.
export default function SimLeaderboard({ items, augments }: { items: Record<string, string>; augments: Record<string, string> }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    fetch("/api/sim-scores")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((b: Board) =>
        setRows(
          b.builds.map((x) => ({
            name: x.champion,
            dps: x.dps,
            survival: x.survival,
            items: x.items.map((k) => items[k] ?? k).join(", "),
            augments: x.augments.map((k) => augments[k] ?? k).join(", ") || "–",
            replay: "Watch",
            href: `/simulator?tab=replays#${x.champion}&items=${x.items.join(",")}&augs=${x.augments.join(",")}`,
          })),
        ),
      )
      .catch(() => setFailed(true));
  }, [items, augments]);

  return (
    <>
      <p className="table-note">
        The highest simulated damage per second visitors have found for each champion. Simulate a build in Fight
        replays with the default settings and press Submit to leaderboard. Every build is simulated again on our side
        before it is listed, and the damage shown is from that run.
      </p>
      {failed ? (
        <p className="table-note">The leaderboard couldn&apos;t be loaded. Try again in a moment.</p>
      ) : rows === null ? (
        <p className="table-note">Loading the leaderboard…</p>
      ) : rows.length === 0 ? (
        <p className="table-note">No builds yet. Be the first: simulate a build and submit it.</p>
      ) : (
        <DataTable
          columns={[
            { key: "name", label: "Champion", format: "champion" },
            { key: "dps", label: "Mean DPS", format: "int" },
            { key: "survival", label: "Survives", format: "pct" },
            { key: "items", label: "Items", format: "text", sortable: false },
            { key: "augments", label: "Augments", format: "text", sortable: false },
            { key: "replay", label: "Replay", format: "text", sortable: false, hrefKey: "href" },
          ]}
          rows={rows}
          initialSort={{ key: "dps", desc: true }}
          searchKey="name"
          searchLabel="Find a champion"
        />
      )}
    </>
  );
}
