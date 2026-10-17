"use client";

import { useEffect, useMemo, useState } from "react";
import championNames from "@/data/champion-names.json";
import { useAdvanced } from "./Advanced";
import ChampionPanel, { hasPanel } from "./ChampionPanel";

export type Column = {
  key: string;
  label: string;
  format?: "pct" | "num" | "int" | "sec" | "text" | "champion" | "augment" | "tier";
  sortable?: boolean;
  /** For "augment" columns: the row key holding the augment id, for its icon. */
  iconKey?: string;
  /** Sort by this row key instead (a tier letter sorts by its score). */
  sortKey?: string;
  /** Explains the column; shown on hover and to screen readers. */
  hint?: string;
};

export type Row = Record<string, string | number | null>;

const NAMES = championNames as Record<string, string>;

// Search matches champion ids ("MonkeyKing") and display names ("Wukong") alike.
function searchText(v: Row[string]) {
  const raw = String(v ?? "");
  const names = raw.split(" ").map((w) => NAMES[w] ?? w.replace(/([a-z])([A-Z])/g, "$1 $2"));
  return `${raw} ${names.join(" ")}`.toLowerCase();
}

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

// Numbers get a colour where it means something: win rates above or below an even 50%, and changes up or down.
function cellClass(c: Column, v: Row[string]) {
  if (!c.format || ["text", "champion", "augment", "tier"].includes(c.format)) return "";
  const n = Number(v);
  if (v === null || v === "" || Number.isNaN(n)) return "num";
  if (c.format === "pct" && /win/.test(c.key)) return n >= 0.52 ? "num wr-high" : n <= 0.48 ? "num wr-low" : "num";
  if (/change|delta/.test(c.key)) return n > 0 ? "num delta-up" : n < 0 ? "num delta-down" : "num";
  return "num";
}

// Champion and augment icons come from the League client (web/scripts/fetch_icons.py).
function Named({ src, name }: { src: string; name: string }) {
  const [broken, setBroken] = useState(false);
  return (
    <span className="champ">
      {!broken && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" width={24} height={24} loading="lazy" onError={() => setBroken(true)} />
      )}
      {name}
    </span>
  );
}

function Champion({ id, onOpen }: { id: string; onOpen: (id: string) => void }) {
  const named = <Named src={`/icons/champions/${id}.webp`} name={NAMES[id] ?? id.replace(/([a-z])([A-Z])/g, "$1 $2")} />;
  if (!hasPanel(id)) return named;
  return (
    <button type="button" className="champ-open" onClick={() => onOpen(id)} title="Splash, pick quote and abilities">
      {named}
    </button>
  );
}

// Sortable, searchable table. Rows are shown a page at a time.
export default function DataTable({
  columns: standardColumns,
  advancedColumns,
  rows,
  initialSort,
  searchKey,
  searchLabel = "Search",
  urlTab,
}: {
  columns: Column[];
  /** Columns for the tier list's Advanced view; the standard columns are used when absent. */
  advancedColumns?: Column[];
  rows: Row[];
  initialSort: { key: string; desc: boolean };
  searchKey?: string;
  searchLabel?: string;
  // Fill the search from ?q= when the page's ?tab= names this table's tab ("" = the default tab).
  urlTab?: string;
}) {
  const columns = useAdvanced() && advancedColumns ? advancedColumns : standardColumns;
  const [sort, setSort] = useState(initialSort);
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(PAGE);
  const [panel, setPanel] = useState<string | null>(null);

  useEffect(() => {
    if (urlTab === undefined) return;
    const p = new URLSearchParams(location.search);
    const q = p.get("q");
    if (q && (p.get("tab") ?? "") === urlTab) setQuery(q);
  }, [urlTab]);

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
      {panel && <ChampionPanel key={panel} alias={panel} onClose={() => setPanel(null)} />}
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
                <th
                  key={c.key}
                  className={c.format && !["text", "champion", "augment", "tier"].includes(c.format) ? "num" : ""}
                  aria-sort={c.sortable !== false && sort.key === (c.sortKey ?? c.key) ? (sort.desc ? "descending" : "ascending") : undefined}
                >
                  {c.sortable === false ? (
                    c.label
                  ) : (
                    <button
                      type="button"
                      onClick={() => toggle(c.sortKey ?? c.key)}
                      title={c.hint}
                    >
                      {c.label}
                      {c.hint && <span className="col-hint" aria-hidden="true">?</span>}
                      <span className="sort-mark">{sort.key === (c.sortKey ?? c.key) ? (sort.desc ? "↓" : "↑") : ""}</span>
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
                  <td key={c.key} className={cellClass(c, r[c.key])}>
                    {c.format === "champion" ? (
                      <Champion id={String(r[c.key])} onOpen={setPanel} />
                    ) : c.format === "augment" ? (
                      <Named src={`/icons/augments/${r[c.iconKey ?? "id"]}.webp`} name={String(r[c.key] ?? "")} />
                    ) : c.format === "tier" && r[c.key] ? (
                      <span className={`chip tier-${String(r[c.key]).toLowerCase()}`}>{r[c.key]}</span>
                    ) : (
                      show(r[c.key], c.format)
                    )}
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
