"use client";

import { useMemo, useState } from "react";
import championNames from "@/data/champion-names.json";

export type Column = {
  key: string;
  label: string;
  format?: "pct" | "num" | "int" | "sec" | "text" | "champion";
  sortable?: boolean;
};

export type Row = Record<string, string | number | null>;

const NAMES = championNames as Record<string, string>;

// Search matches champion ids ("MonkeyKing") and display names ("Wukong") alike.
function searchText(v: Row[string]) {
  const raw = String(v ?? "");
  return `${raw} ${raw.split(" ").map((w) => NAMES[w] ?? "").join(" ")}`.toLowerCase();
}

const DDRAGON = "https://ddragon.leagueoflegends.com/cdn/16.20.1/img/champion";
const PAGE = 50;

function show(v: Row[string], format: Column["format"]) {
  if (v === null || v === "") return "–";
  const n = Number(v);
  switch (format) {
    case "pct":
      return `${(n * 100).toFixed(1)}%`;
    case "num":
      return n.toFixed(1);
    case "int":
      return Math.round(n).toLocaleString();
    case "sec":
      return `${Math.round(n)}s`;
    default:
      return String(v);
  }
}

function Champion({ id }: { id: string }) {
  const [broken, setBroken] = useState(false);
  return (
    <span className="champ">
      {!broken && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`${DDRAGON}/${id}.png`} alt="" width={24} height={24} loading="lazy" onError={() => setBroken(true)} />
      )}
      {NAMES[id] ?? id.replace(/([a-z])([A-Z])/g, "$1 $2")}
    </span>
  );
}

// Sortable, searchable table. Rows are shown a page at a time.
export default function DataTable({
  columns,
  rows,
  initialSort,
  searchKey,
  searchLabel = "Search",
}: {
  columns: Column[];
  rows: Row[];
  initialSort: { key: string; desc: boolean };
  searchKey?: string;
  searchLabel?: string;
}) {
  const [sort, setSort] = useState(initialSort);
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(PAGE);

  const sorted = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q && searchKey ? rows.filter((r) => searchText(r[searchKey]).includes(q)) : rows;
    const dir = sort.desc ? -1 : 1;
    return [...filtered].sort((a, b) => {
      const x = a[sort.key];
      const y = b[sort.key];
      if (typeof x === "number" && typeof y === "number") return (x - y) * dir;
      return String(x ?? "").localeCompare(String(y ?? "")) * dir;
    });
  }, [rows, sort, query, searchKey]);

  const toggle = (key: string) =>
    setSort((s) => (s.key === key ? { key, desc: !s.desc } : { key, desc: key !== searchKey }));

  return (
    <div className="data-table">
      {searchKey && (
        <input
          className="table-search"
          type="search"
          placeholder={searchLabel}
          aria-label={searchLabel}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setShown(PAGE);
          }}
        />
      )}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th className="num">#</th>
              {columns.map((c) => (
                <th key={c.key} className={c.format && c.format !== "text" && c.format !== "champion" ? "num" : ""}>
                  {c.sortable === false ? (
                    c.label
                  ) : (
                    <button type="button" onClick={() => toggle(c.key)} aria-sort={sort.key === c.key ? (sort.desc ? "descending" : "ascending") : undefined}>
                      {c.label}
                      <span className="sort-mark">{sort.key === c.key ? (sort.desc ? "↓" : "↑") : ""}</span>
                    </button>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.slice(0, shown).map((r, i) => (
              <tr key={i}>
                <td className="num muted-cell">{i + 1}</td>
                {columns.map((c) => (
                  <td key={c.key} className={c.format && c.format !== "text" && c.format !== "champion" ? "num" : ""}>
                    {c.format === "champion" ? <Champion id={String(r[c.key])} /> : show(r[c.key], c.format)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sorted.length === 0 && <p className="table-note">No matches.</p>}
      {sorted.length > shown && (
        <button type="button" className="show-more" onClick={() => setShown((n) => n + PAGE * 2)}>
          Show more ({sorted.length - shown} left)
        </button>
      )}
    </div>
  );
}
