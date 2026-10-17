"use client";

import { useEffect, useState } from "react";
import DataTable, { type Row } from "./DataTable";

// The Duos tab: 2,000 pairs, so they load from /data/duos.json when the tab is first opened, not with the page.
export default function DuosTable() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    fetch("/data/duos.json")
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(setRows)
      .catch(() => setFailed(true));
  }, []);
  if (!rows) return <p className="table-note">{failed ? "Duos didn't load. Reload the page to try again." : "Loading duos…"}</p>;
  return (
    <DataTable
      columns={[
        { key: "a", label: "Champion", format: "champion" },
        { key: "b", label: "With", format: "champion" },
        { key: "win_rate", label: "Win rate", format: "pct" },
        { key: "pick_rate", label: "Pick rate", format: "pct" },
      ]}
      advancedColumns={[
        { key: "a", label: "Champion", format: "champion" },
        { key: "b", label: "With", format: "champion" },
        { key: "win_rate", label: "Win rate", format: "pct" },
        { key: "pick_rate", label: "Pick rate", format: "pct" },
        { key: "rank", label: "Rank", format: "int" },
        { key: "roles", label: "Roles", format: "text", sortable: false },
      ]}
      rows={rows}
      initialSort={{ key: "win_rate", desc: true }}
      searchKey="pair"
      searchLabel="Find a champion"
      urlTab="duos"
    />
  );
}
